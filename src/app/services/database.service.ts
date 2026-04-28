import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {

  private HISTORY_KEY = 'history';

  async addHistory(name: string, path: string, thumbnail: string, images: string[]) {
    const date = new Date().toISOString();

    const history = await this.getHistory();

    history.unshift({
      id: Date.now(),
      name,
      path,
      date,
      thumbnail,
      images
    });

    // limit 5 for Native, 2 for Web (due to localStorage 5MB limit)
    const limit = Capacitor.isNativePlatform() ? 5 : 2;
    const limited = history.slice(0, limit);


    try {
      if (Capacitor.isNativePlatform()) {
        await Preferences.set({
          key: this.HISTORY_KEY,
          value: JSON.stringify(limited)
        });
      } else {
        // 🌐 Web: gunakan localStorage
        localStorage.setItem(this.HISTORY_KEY, JSON.stringify(limited));
      }
      console.log("HISTORY DISIMPAN:", limited);
    } catch (e) {
      console.error("Gagal simpan ke storage:", e);
      if (e instanceof Error && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        alert("Penyimpanan penuh! Hapus riwayat lama untuk melanjutkan.");
      }
      throw e;
    }
  }


  async getHistory(): Promise<any[]> {
    let value: string | null = null;

    if (Capacitor.isNativePlatform()) {
      const result = await Preferences.get({ key: this.HISTORY_KEY });
      value = result.value;
    } else {
      // 🌐 Web: gunakan localStorage
      value = localStorage.getItem(this.HISTORY_KEY);
    }

    if (!value) return [];

    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  async deleteHistory(id: number) {
    const history = await this.getHistory();
    const filtered = history.filter(item => item.id !== id);

    if (Capacitor.isNativePlatform()) {
      await Preferences.set({
        key: this.HISTORY_KEY,
        value: JSON.stringify(filtered)
      });
    } else {
      // 🌐 Web: gunakan localStorage
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(filtered));
    }
  }

  async clearHistory() {
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key: this.HISTORY_KEY });
    } else {
      // 🌐 Web: gunakan localStorage
      localStorage.removeItem(this.HISTORY_KEY);
    }
  }
}