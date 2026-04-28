import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { AlertController, LoadingController } from '@ionic/angular';

import { Router } from '@angular/router';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { ImageService } from '../image.service';
import { DatabaseService } from '../services/database.service';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomePage {
  private worker: Worker | null = null;



  images: string[] = [];
  history: any[] = [];

  constructor(
    private router: Router,
    private imageService: ImageService,
    private dbService: DatabaseService,
    private cdr: ChangeDetectorRef,
    private alertController: AlertController,
    private loadingController: LoadingController
  ) {
    try {
      if (typeof Worker !== 'undefined') {
        this.worker = new Worker(new URL('../image.worker', import.meta.url));
      }
    } catch (e) {
      console.warn("Web Worker failed to load, falling back to main thread:", e);
    }
  }





  async ionViewWillEnter() {
    this.images = [];
    await this.loadHistory();
  }

  async loadHistory() {
    try {
      this.history = await this.dbService.getHistory();
      this.cdr.markForCheck();
      console.log("HISTORY:", this.history);

    } catch (e) {
      console.error("Gagal load history:", e);
      this.history = [];
    }
  }

  async selectImage(isCamera: boolean, autoPreview: boolean = true): Promise<boolean> {
    try {
      if (Capacitor.isNativePlatform()) {
        await Camera.requestPermissions();
      }

      const image = await Camera.getPhoto({
        quality: 50,
        resultType: CameraResultType.DataUrl,
        source: isCamera ? CameraSource.Camera : CameraSource.Photos
      });

      if (!image?.dataUrl) {
        return false;
      }

      const loading = await this.loadingController.create({ message: 'Menyiapkan Gambar...', spinner: 'dots', cssClass: 'premium-loading' });
      await loading.present();

      const resized = await this.resizeImage(image.dataUrl);

      if (Capacitor.isNativePlatform()) {
        const fileName = await this.saveImageToFile(resized);
        const fileUri = await Filesystem.getUri({
          directory: Directory.Data,
          path: fileName
        });
        const webUrl = Capacitor.convertFileSrc(fileUri.uri);
        this.images.push(webUrl);
      } else {
        this.images.push(resized);
      }
      this.cdr.markForCheck();

      await loading.dismiss();

      if (autoPreview) {
        this.finalizePreview(this.images.length - 1);
      }

      return true;
    } catch (e) {
      console.error("Gagal mengambil gambar:", e);
      // Ensure loading closes if failed halfway (though 'loading' scoping might be an issue. Let me refactor it)
      this.loadingController.dismiss().catch(() => {});
      return false;
    }
  }

  async takeFromCamera() {
    const firstAdded = await this.selectImage(true, false);
    if (!firstAdded) {
      return;
    }

    while (true) {
      const shouldTakeMore = await new Promise<boolean>(async (resolve) => {
        const alert = await this.alertController.create({
          header: 'Foto Ditambahkan \u2728',
          message: 'Apakah Anda ingin mengambil lembar foto berikutnya?',
          cssClass: 'premium-alert',
          buttons: [
            {
              text: 'Buka Kamera',
              cssClass: 'alert-btn-confirm',
              handler: () => resolve(true)
            },
            {
              text: 'Lanjut Preview',
              role: 'cancel',
              cssClass: 'alert-btn-cancel',
              handler: () => resolve(false)
            }
          ]
        });
        await alert.present();
      });

      if (!shouldTakeMore) {
        this.finalizePreview(this.images.length - 1);
        break;
      }
      
      const added = await this.selectImage(true, false);
      if (!added) {
        this.finalizePreview(this.images.length - 1);
        break;
      }
    }
  }

  finalizePreview(selectedIndex: number) {
    this.imageService.setImages(this.images);
    this.imageService.setSelectedImageIndex(selectedIndex);
    
    // 🔥 Yield to ensure click animation (ripple) completes before heavy navigation
    setTimeout(() => {
      this.router.navigate(['/preview']);
    }, 0);
  }


  async takeFromGallery() {
    try {
      // Gunakan pickImages (jamak) bukan getPhoto (tunggal)
      const result = await Camera.pickImages({
        quality: 50,
        limit: 0 // 0 berarti tidak ada batasan jumlah foto yang dipilih
      });

      if (result.photos && result.photos.length > 0) {
        const loading = await this.loadingController.create({ message: 'Memproses Foto...', spinner: 'dots', cssClass: 'premium-loading' });
        await loading.present();
        for (let photo of result.photos) {
          // photo.webPath adalah URL yang bisa dibaca <img>

          // 1. Baca sebagai base64 untuk resize
          const base64 = await this.readAsBase64(photo.webPath);
          const resized = await this.resizeImage(base64);

          if (Capacitor.isNativePlatform()) {
            // 2. Simpan ke file system
            const fileName = await this.saveImageToFile(resized);

            // 3. Ambil WebURL agar bisa muncul di Home
            const fileUri = await Filesystem.getUri({
              directory: Directory.Data,
              path: fileName
            });
            this.images.push(Capacitor.convertFileSrc(fileUri.uri));
          } else {
            // Jika di browser
            this.images.push(resized);
          }
        }
        this.cdr.markForCheck();

        // Simpan ke service dan navigasi ke preview
        this.imageService.setImages(this.images);
        this.imageService.setSelectedImageIndex(0);
        await loading.dismiss();
        this.router.navigate(['/preview']);
      }
    } catch (e) {
      console.error("User membatalkan pilihan atau error:", e);
    }
  }

  // Tambahkan helper ini di bawah untuk membaca webPath menjadi Base64
  private async readAsBase64(webPath: string): Promise<string> {
    const response = await fetch(webPath);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(blob);
    });
  }

  removeImage(index: number) {
    this.images.splice(index, 1);
    this.cdr.markForCheck();
  }


  async resizeImage(base64: string): Promise<string> {
    if (!this.worker) {
        // Fallback jika worker tidak support
        return base64;
    }

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.warn("Home resize timeout, falling back");
            this.worker?.removeEventListener('message', handler);
            resolve(base64);
        }, 5000);

        const handler = (event: MessageEvent) => {
            if (event.data.type === 'resize_result' || event.data.type === 'error') {
                clearTimeout(timeout);
                this.worker?.removeEventListener('message', handler);
                resolve(event.data.base64 || base64);
            }
        };

        this.worker?.addEventListener('message', handler);
        this.worker?.postMessage({
            type: 'resize',
            payload: { base64, maxWidth: 1000 }
        });
    });
  }



  async saveImageToFile(base64: string): Promise<string> {
    const base64Data = base64.split(',')[1];
    const fileName = `img_${Date.now()}.jpg`;

    await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Data
    });

    return fileName;
  }

  openHistory(item: any) {
    const images = item.images || [];
    this.imageService.setImages(images);
    setTimeout(() => {
        this.router.navigate(['/editor']);
    }, 0);
  }


  goToHistory() {
    this.router.navigate(['/history']);
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goToEditor() {
    if (this.images.length > 0) {
      let imagesToSave: string[] = [];

      if (Capacitor.isNativePlatform()) {
        // Ambil hanya nama filenya saja (img_123.jpg) dari URL
        imagesToSave = this.images.map(img => {
          const parts = img.split('/');
          return parts[parts.length - 1].split('?')[0];
        });
      } else {
        imagesToSave = this.images;
      }

      this.imageService.setImages(imagesToSave);
      this.router.navigate(['/editor']);
    } else {
      alert('Pilih foto dulu!');
    }
  }
}