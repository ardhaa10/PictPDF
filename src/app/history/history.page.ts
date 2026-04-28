import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';

import { DatabaseService } from '../services/database.service';
import { Router } from '@angular/router';
import { ImageService } from '../image.service';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})

export class HistoryPage {

  private worker: Worker | null = null;




  history: any[] = [];
  isLoading: boolean = true;

  constructor(
    private dbService: DatabaseService,
    private router: Router,
    private imageService: ImageService,
    private cdr: ChangeDetectorRef
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
    await this.loadHistory();
  }


  async loadHistory() {
    this.isLoading = true;
    this.cdr.markForCheck();
    try {
      this.history = await this.dbService.getHistory();
      this.isLoading = false;
      this.cdr.markForCheck();
      console.log("HISTORY LOADED:", this.history);

      console.log("HISTORY LENGTH:", this.history.length);
      if (this.history.length > 0) {
        console.log("FIRST ITEM:", this.history[0]);
      }
    } catch (e) {
      console.error("Gagal load history:", e);
      this.history = [];
      this.isLoading = false;
    }
  }

  openHistory(item: any) {
    const images = item.images || [];
    this.imageService.setImages(images);

    setTimeout(() => {
      this.router.navigate(['/editor'], { state: { from: 'history' } });
    }, 0);
  }


  async deleteHistory(id: number) {
    try {
      await this.dbService.deleteHistory(id);
      await this.loadHistory();
    } catch (e) {
      console.error("Gagal hapus history:", e);
    }
  }


  async scanAndGoHome() {

    try {
      if (Capacitor.isNativePlatform()) {
        await Camera.requestPermissions();
      }

      const image = await Camera.getPhoto({
        quality: 50,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });

      if (image?.dataUrl) {
        // Simpan gambar ke service dan pindah ke home
        const resized = await this.resizeImage(image.dataUrl);
        this.imageService.setImages([resized]);
        this.router.navigate(['/home']);
      }
    } catch (e) {
      console.error("Gagal mengambil gambar:", e);
    }
  }

  private async resizeImage(base64: string): Promise<string> {
    if (!this.worker) return base64;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn("History resize timeout, falling back");
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



  trackByItem(index: number, item: any): any {
    return item.id || index;
  }

}
