import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, NgZone } from '@angular/core';

import { ImageService } from '../image.service';
import Cropper from 'cropperjs';
import jsPDF from 'jspdf';
import { DatabaseService } from '../services/database.service';
import { Platform } from '@ionic/angular';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-editor',
  templateUrl: './editor.page.html',
  styleUrls: ['./editor.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditorPage implements OnInit {
  private worker: Worker | null = null;



  images: string[] = [];          // base64 (buat crop/pdf)
  fileImages: string[] = [];      // fileName (buat history)
  originalImages: string[] = [];

  selectedImage: string = '';
  selectedImageSource: string = '';
  selectedImageOriginal: string = '';
  selectedIndex: number = -1;
  cropper: any;
  activeRatio: number = 0;
  returnToHistory: boolean = false;
  activeFilter: string = 'none';
  filters = [
    { name: 'Normal', value: 'none', style: 'none' },
    { name: 'Hitam Putih', value: 'grayscale', style: 'grayscale(100%)' },
    { name: 'Kontras', value: 'contrast', style: 'contrast(150%)' },
    { name: 'Terang', value: 'brightness', style: 'brightness(120%)' },
    { name: 'Vintage', value: 'sepia', style: 'sepia(60%)' }
  ];
  @ViewChild('fileInput') fileInput!: ElementRef;
  pdfName: string = 'PictPDF_Document';
  isSuccessModalOpen: boolean = false;
  lastCreatedFilePath: string = '';

  constructor(
    private imageService: ImageService,
    private dbService: DatabaseService,
    private platform: Platform,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    try {
      if (typeof Worker !== 'undefined') {
        this.worker = new Worker(new URL('../image.worker', import.meta.url));
      }
    } catch (e) {
      console.warn("Web Worker failed to load, falling back to main thread:", e);
    }
  }




  async ngOnInit() {
    const storedImages = this.imageService.getImages();

    if (!storedImages || storedImages.length === 0) {
      this.router.navigate(['/home'], { replaceUrl: true });
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      this.images = storedImages;
      this.fileImages = [];
      this.originalImages = [...this.images];
      this.cdr.markForCheck();
      return;
    }

    this.fileImages = storedImages;
    this.images = [];

    for (const fileName of this.fileImages) {
      try {
        const read = await Filesystem.readFile({
          path: fileName,
          directory: Directory.Data
        });

        this.images.push(`data:image/jpeg;base64,${read.data}`);

        // Yield ke main thread setiap 1 gambar
        this.cdr.markForCheck();
        await new Promise(resolve => setTimeout(resolve, 0));

      } catch (e) {
        console.error("Gagal baca file:", fileName, e);
      }
    }

    this.originalImages = [...this.images];
    this.cdr.markForCheck();

    const state = history.state as any;
    if (state?.from === 'history') {
      this.returnToHistory = true;
    }
  }


  goBack() {
    if (this.returnToHistory) {
      this.router.navigate(['/history'], { replaceUrl: true });
    } else {
      this.router.navigate(['/home'], { replaceUrl: true });
    }
  }

  selectImage(img: string, index: number) {
    this.selectedIndex = index;
    this.selectedImageOriginal = this.originalImages[index] || img;
    this.selectedImageSource = this.selectedImageOriginal;
    this.selectedImage = img;
    this.activeFilter = 'none';
    this.activeRatio = 0;

    setTimeout(() => {
      const image = document.getElementById('crop-image') as HTMLImageElement;
      if (!image) return;

      if (this.cropper) this.cropper.destroy();

      this.ngZone.runOutsideAngular(() => {
        this.cropper = new Cropper(image, {
          viewMode: 1,
          autoCropArea: 1,
          responsive: true,
          background: false,
          movable: true,
          zoomable: true,
          scalable: true,
          rotatable: true,
          cropBoxResizable: true
        });
        this.applyCssFilterToCropper();
      });
      this.cdr.markForCheck();
    }, 100);
  }

  filterStyle(filterValue: string): string {
    const filter = this.filters.find(f => f.value === filterValue);
    return filter ? filter.style : 'none';
  }

  setFilter(filterValue: string) {
    this.activeFilter = filterValue;
    this.applyCssFilterToCropper();
  }

  private applyCssFilterToCropper() {
    const image = document.getElementById('crop-image') as HTMLImageElement;
    if (image) {
      image.style.filter = this.filterStyle(this.activeFilter);
    }
    const cropContainer = document.querySelector('.crop-container') as HTMLElement;
    if (cropContainer) {
      cropContainer.style.filter = this.filterStyle(this.activeFilter);
    }
  }

  async cropImage() {
    if (!this.cropper) return;

    const sourceCanvas = this.cropper.getCroppedCanvas({
      maxWidth: 1000,
      maxHeight: 1400
    });

    const tempBase64 = sourceCanvas.toDataURL('image/jpeg', 1.0);

    const croppedImage = await this.applyFilterViaWorker(tempBase64, this.activeFilter);

    const index = this.selectedIndex !== -1 ? this.selectedIndex : this.images.indexOf(this.selectedImage);
    if (index !== -1) {
      this.images[index] = croppedImage;
      if (this.activeFilter === 'none') {
        this.originalImages[index] = croppedImage;
      }
    }

    this.closeCrop();
    this.cdr.markForCheck();
  }

  private applyFilterViaWorker(base64: string, filter: string): Promise<string> {
    if (!this.worker || filter === 'none') return Promise.resolve(base64);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn("Filter worker timeout, falling back");
        this.worker?.removeEventListener('message', handler);
        resolve(base64);
      }, 5000);

      const handler = (event: MessageEvent) => {
        if (event.data.type === 'filter_result' || event.data.type === 'error') {
          clearTimeout(timeout);
          this.worker?.removeEventListener('message', handler);
          resolve(event.data.base64 || base64);
        }
      };
      this.worker?.addEventListener('message', handler);
      this.worker?.postMessage({
        type: 'filter',
        payload: { base64, filter }
      });
    });
  }





  private clamp(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  closeCrop() {
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }
    this.selectedImage = '';
    this.selectedImageSource = '';
    this.selectedIndex = -1;
    this.selectedImageOriginal = '';
    this.activeFilter = 'none';
    this.activeRatio = 0;
    this.cdr.markForCheck();
  }

  resetEdit() {
    this.activeFilter = 'none';
    if (this.cropper) {
      const original = this.selectedImageOriginal || this.selectedImage;
      this.selectedImage = original;
      this.selectedImageSource = original;
      this.cropper.replace(original);
      this.applyCssFilterToCropper();
    }
  }

  setAspectRatio(ratio: number) {
    this.activeRatio = ratio;
    if (this.cropper) {
      this.cropper.setAspectRatio(ratio === 0 ? NaN : ratio);
    }
  }

  async rotateCrop() {
    if (!this.cropper) return;

    const sourceImage = this.selectedImageSource || this.selectedImageOriginal || this.selectedImage;
    if (!sourceImage) return;

    try {
      const rotatedImage = await this.rotateBase64Image(sourceImage);
      this.selectedImageSource = rotatedImage;
      this.selectedImage = rotatedImage;

      if (this.cropper) {
        this.cropper.replace(rotatedImage);
        this.applyCssFilterToCropper();
      }
      this.cdr.markForCheck();
    } catch (e) {
      console.error('Gagal memutar gambar:', e);
    }
  }

  private rotateBase64Image(dataUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.height;
        canvas.height = image.width;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Tidak bisa membuat context canvas'));
          return;
        }

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(image, -image.width / 2, -image.height / 2);

        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      image.onerror = (err) => reject(err);
      image.src = dataUrl;
    });
  }

  resetCropRotation() {
    if (this.cropper) {
      this.cropper.reset();
      this.activeRatio = 0;
    }
  }

  openFilePicker() {
    this.fileInput.nativeElement.click();
  }


  async onFilesSelected(event: any) {
    const files = event.target.files;
    if (!files.length) return;

    for (let file of files) {
      const reader = new FileReader();

      reader.onload = async (e: any) => {
        const base64 = e.target.result;

        // 🌐 WEB
        if (!Capacitor.isNativePlatform()) {
          this.images.push(base64);
          this.originalImages.push(base64);
          this.cdr.markForCheck();
          return;
        }

        // 📱 ANDROID
        try {
          const fileName = `img_${Date.now()}_${Math.random()}.jpeg`;
          const base64Data = base64.split(',')[1];

          await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Data
          });

          this.fileImages.push(fileName);
          this.images.push(base64);
          this.originalImages.push(base64);
          this.cdr.markForCheck();

        } catch (err) {
          console.error("Gagal simpan:", err);
        }
      };

      reader.readAsDataURL(file);
    }

    event.target.value = ''; // reset biar bisa pilih ulang
  }


  async pickImages(): Promise<string[]> {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos
    });

    return image?.dataUrl ? [image.dataUrl] : [];
  }

  deleteImage(index: number) {
    this.images.splice(index, 1);
    this.originalImages.splice(index, 1);

    // kalau native hapus juga fileImages
    if (Capacitor.isNativePlatform()) {
      this.fileImages.splice(index, 1);
      this.imageService.setImages(this.fileImages);
    } else {
      this.imageService.setImages(this.images);
    }

    if (this.images.length === 0) {
      this.router.navigate(['/home'], { replaceUrl: true });
    }
    this.cdr.markForCheck();
  }

  async createPDF() {
    if (this.images.length === 0) {
      alert('Belum ada gambar!');
      return;
    }

    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      for (let i = 0; i < this.images.length; i++) {
        if (i !== 0) doc.addPage();

        const imgData = this.images[i];
        const props = doc.getImageProperties(imgData);

        const ratio = props.width / props.height;

        let width = pageWidth;
        let height = width / ratio;

        if (height > pageHeight) {
          height = pageHeight;
          width = height * ratio;
        }

        const x = (pageWidth - width) / 2;
        const y = (pageHeight - height) / 2;

        doc.addImage(imgData, 'JPEG', x, y, width, height);

        // 🔥 Yield to main thread every page to avoid "frozen UI" appearance
        await new Promise(resolve => setTimeout(resolve, 0));
      }


      const fileName = `${this.pdfName || 'PictPDF'}.pdf`;

      let filePath = '';

      // 📱 Android
      if (Capacitor.isNativePlatform()) {
        const pdfDataUri = doc.output('datauristring');
        if (!pdfDataUri || !pdfDataUri.includes(',')) {
          throw new Error('Gagal mengekspor data PDF (Format invalid)');
        }
        const pdfBase64 = pdfDataUri.split(',')[1];

        console.log("PDF Created, size:", pdfBase64.length);

        const result = await Filesystem.writeFile({
          path: fileName,
          data: pdfBase64,
          directory: Directory.Cache,
          recursive: true
        });


        filePath = result.uri;

        try {
          await Share.share({
            title: 'Bagikan PDF',
            text: 'Ini file PDF kamu',
            url: filePath
          });
        } catch (err) {
          console.warn("Share dibatalkan:", err);
        }

      } else {
        // 🌐 Web
        doc.save(fileName);
        filePath = fileName;
      }

      const thumbnail = this.images[0]
        ? await this.makeThumbnail(this.images[0])
        : '';

      console.log("THUMBNAIL CREATED:", thumbnail ? "YES" : "NO");

      // 🔥 history
      console.log("SAVING TO HISTORY:", {
        fileName,
        filePath,
        thumbnail: thumbnail ? "HAS_THUMBNAIL" : "NO_THUMBNAIL",
        imagesCount: Capacitor.isNativePlatform() ? this.fileImages.length : this.images.length
      });

      await this.dbService.addHistory(
        fileName,
        filePath,
        thumbnail,
        Capacitor.isNativePlatform() ? this.fileImages : this.images
      );

      console.log("HISTORY SAVED SUCCESSFULLY");

      this.lastCreatedFilePath = filePath;
      this.isSuccessModalOpen = true;
      this.cdr.markForCheck();

    } catch (error) {
      console.error('CRITICAL: Error create PDF:', error);
      alert('Gagal membuat PDF! Detail: ' + (error instanceof Error ? error.message : String(error)));
    }
  }




  async makeThumbnail(base64: string): Promise<string> {
    if (!this.worker) return base64;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn("Thumbnail worker timeout");
        this.worker?.removeEventListener('message', handler);
        resolve(base64);
      }, 3000);

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
        payload: { base64, maxWidth: 200 }
      });
    });
  }




  drop(event: any) {
    moveItemInArray(this.images, event.previousIndex, event.currentIndex);

    // 🔥 IMPORTANT: sinkron urutan originalImages juga
    moveItemInArray(this.originalImages, event.previousIndex, event.currentIndex);

    // 🔥 kalau Android, fileImages juga harus ikut
    if (this.fileImages.length) {
      moveItemInArray(this.fileImages, event.previousIndex, event.currentIndex);
    }
    this.cdr.markForCheck();
  }

  // Tambah gambar lagi (gabung ke array lama)
  async addMoreImages() {
    const newImages = await this.pickImages();

    if (!newImages.length) return;

    // 🔥 WEB (langsung pakai base64)
    if (!Capacitor.isNativePlatform()) {
      this.images = [...this.images, ...newImages];
      this.originalImages = [...this.originalImages, ...newImages];
      this.cdr.markForCheck();
      return;
    }

    // 📱 ANDROID (harus simpan ke file dulu)
    for (let img of newImages) {
      try {
        const fileName = `img_${Date.now()}.jpeg`;

        const base64Data = img.split(',')[1]; // ambil base64 tanpa prefix

        await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Data
        });

        // simpan ke array
        this.fileImages.push(fileName);
        this.images.push(img);
        this.originalImages.push(img);

      } catch (err) {
        console.error("Gagal simpan gambar:", err);
      }
    }

    // 🔥 update service biar history konsisten
    this.imageService.setImages(this.fileImages);
    this.cdr.markForCheck();
  }

  trackByImg(index: number, item: string): string {
    return item;
  }

  async shareLastPDF() {
    if (!this.lastCreatedFilePath) return;

    try {
      await Share.share({
        title: 'Bagikan PDF',
        text: 'Ini file PDF kamu',
        url: this.lastCreatedFilePath
      });
    } catch (err) {
      console.warn("Share dibatalkan:", err);
    }
  }

  dismissSuccessModal() {
    this.isSuccessModalOpen = false;
    this.router.navigate(['/home'], { replaceUrl: true });
  }

}
