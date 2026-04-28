import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';

import { Router } from '@angular/router';
import { ImageService } from '../image.service';
import { Capacitor } from '@capacitor/core';


@Component({
  selector: 'app-preview',
  templateUrl: './preview.page.html',
  styleUrls: ['./preview.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreviewPage implements OnInit {

  selectedImage: string = '';
  imageIndex: number = 0;
  totalImages: number = 0;

  constructor(
    private router: Router,
    private imageService: ImageService,
    private cdr: ChangeDetectorRef
  ) { }


  ngOnInit() {
    const images = this.imageService.getImages();
    const index = this.imageService.getSelectedImageIndex();

    if (!images || images.length === 0) {
      this.router.navigate(['/home'], { replaceUrl: true });
      return;
    }

    this.selectedImage = images[index];
    this.imageIndex = index;
    this.totalImages = images.length;
    this.cdr.markForCheck();
  }


  goBack() {
    this.router.navigate(['/home'], { replaceUrl: true });
  }

  goToEditor() {
    if (Capacitor.isNativePlatform()) {
      const images = this.imageService.getImages();
      const filenames = images.map(img => {
        const parts = img.split('/');
        return parts[parts.length - 1].split('?')[0];
      });
      this.imageService.setImages(filenames);
    }
    this.router.navigate(['/editor'], { replaceUrl: true });
  }


  nextImage() {
    const images = this.imageService.getImages();
    if (this.imageIndex < images.length - 1) {
      this.imageIndex++;
      this.imageService.setSelectedImageIndex(this.imageIndex);
      this.selectedImage = images[this.imageIndex];
      this.cdr.markForCheck();
    }
  }


  prevImage() {
    const images = this.imageService.getImages();
    if (this.imageIndex > 0) {
      this.imageIndex--;
      this.imageService.setSelectedImageIndex(this.imageIndex);
      this.selectedImage = images[this.imageIndex];
      this.cdr.markForCheck();
    }
  }


  removeImage() {
    const images = this.imageService.getImages();
    images.splice(this.imageIndex, 1);
    this.imageService.setImages(images);
    this.totalImages = images.length;

    if (images.length === 0) {
      this.goBack();
    } else if (this.imageIndex >= images.length) {
      this.imageIndex = images.length - 1;
    }

    this.selectedImage = images[this.imageIndex];
    this.cdr.markForCheck();
  }

}
