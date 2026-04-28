import { Injectable, signal, computed } from '@angular/core';


@Injectable({
  providedIn: 'root'
})
export class ImageService {
  // 🔥 Gunakan Signals untuk performa maksimal & INP rendah
  private imagesSignal = signal<string[]>([]);
  private selectedIndexSignal = signal<number>(0);

  // Read-only signals untuk UI
  public readonly images = this.imagesSignal.asReadonly();
  public readonly selectedIndex = this.selectedIndexSignal.asReadonly();
  public readonly totalImages = computed(() => this.imagesSignal().length);

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const data = localStorage.getItem("images");
    if (data) {
      try {
        const parsed = JSON.parse(data);
        this.imagesSignal.set(parsed);
      } catch (e) {
        console.error("Gagal parse images:", e);
      }
    }
  }

  setImages(images: string[]) {
    this.imagesSignal.set(images);
    try {
      localStorage.setItem("images", JSON.stringify(images));
    } catch (e) {
      console.error("LocalStorage penuh!", e);
    }
  }

  getImages(): string[] {
    return this.imagesSignal();
  }

  clearImages() {
    this.imagesSignal.set([]);
    localStorage.removeItem("images");
  }

  setSelectedImageIndex(index: number) {
    this.selectedIndexSignal.set(index);
  }

  getSelectedImageIndex(): number {
    return this.selectedIndexSignal();
  }
}

