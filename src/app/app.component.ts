import { Component, ViewChild } from '@angular/core';
import { IonRouterOutlet, Platform, ToastController } from '@ionic/angular';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  @ViewChild(IonRouterOutlet, { static: true }) routerOutlet?: IonRouterOutlet;
  private lastBackPress = 0;
  private timePeriodToExit = 2000;

  constructor(
    private platform: Platform,
    private toastController: ToastController
  ) {
    this.initializeApp();
  }

  initializeApp() {
    this.platform.ready().then(() => {
      if (Capacitor.isNativePlatform()) {
        StatusBar.setStyle({ style: Style.Light });
        StatusBar.setOverlaysWebView({ overlay: true });
      }
    });

    this.platform.backButton.subscribeWithPriority(10, async (processNextHandler) => {
      if (this.routerOutlet && !this.routerOutlet.canGoBack()) {
        const currentTime = Date.now();
        if (currentTime - this.lastBackPress < this.timePeriodToExit) {
          App.exitApp();
        } else {
          this.lastBackPress = currentTime;
          this.presentToast();
        }
      } else {
        // Biarkan Ionic menangani navigasi back ke halaman sebelumnya
        processNextHandler();
      }
    });
  }

  async presentToast() {
    const toast = await this.toastController.create({
      message: 'Tekan sekali lagi untuk keluar',
      duration: 2000,
      position: 'bottom',
      cssClass: 'custom-toast'
    });
    await toast.present();
  }
}