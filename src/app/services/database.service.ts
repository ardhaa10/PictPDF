import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

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

    // limit 15 for Native, 5 for Web
    const limit = Capacitor.isNativePlatform() ? 15 : 5;
    
    // 🔥 Hapus file fisik untuk item yang terbuang dari limit
    if (history.length > limit && Capacitor.isNativePlatform()) {
      const itemsToDelete = history.slice(limit);
      for (const item of itemsToDelete) {
        await this.deletePhysicalFiles(item.images);
      }
    }

    const limited = history.slice(0, limit);

    try {
      if (Capacitor.isNativePlatform()) {
        await Preferences.set({
          key: this.HISTORY_KEY,
          value: JSON.stringify(limited)
        });
      } else {
        localStorage.setItem(this.HISTORY_KEY, JSON.stringify(limited));
      }
    } catch (e) {
      console.error("Gagal simpan ke storage:", e);
      throw e;
    }
  }

  async getHistory(): Promise<any[]> {
    let value: string | null = null;
    if (Capacitor.isNativePlatform()) {
      const result = await Preferences.get({ key: this.HISTORY_KEY });
      value = result.value;
    } else {
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
    let history = await this.getHistory();
    const itemToDelete = history.find(item => item.id === id);

    // 🔥 Hapus file fisik jika di mobile
    if (itemToDelete && Capacitor.isNativePlatform()) {
      await this.deletePhysicalFiles(itemToDelete.images);
    }

    const filtered = history.filter(item => item.id !== id);

    if (Capacitor.isNativePlatform()) {
      await Preferences.set({
        key: this.HISTORY_KEY,
        value: JSON.stringify(filtered)
      });
    } else {
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(filtered));
    }
  }

  async clearHistory() {
    if (Capacitor.isNativePlatform()) {
      const history = await this.getHistory();
      for (const item of history) {
        await this.deletePhysicalFiles(item.images);
      }
      await Preferences.remove({ key: this.HISTORY_KEY });
    } else {
      localStorage.removeItem(this.HISTORY_KEY);
    }
  }

  private async deletePhysicalFiles(fileNames: string[]) {
    if (!fileNames || !Array.isArray(fileNames)) return;
    for (const fileName of fileNames) {
      try {
        // Hanya hapus jika itu nama file (bukan base64)
        if (fileName && !fileName.startsWith('data:') && !fileName.startsWith('http')) {
          // Jika fileName adalah URL penuh dari Capacitor.convertFileSrc, 
          // kita perlu mengambil nama filenya saja atau path aslinya.
          // Namun di PictPDF kita menyimpan nama filenya saja di fileImages.
          
          let path = fileName;
          // Bersihkan jika ada prefix url
          if (path.includes('_caps_')) {
             // Ini berarti ini adalah webView path, kita tidak bisa menghapusnya langsung
             // Tapi di databaseService kita menyimpan fileImages (nama file saja)
          }

          await Filesystem.deleteFile({
            path: path,
            directory: Directory.Data
          });
          console.log("File fisik terhapus:", path);
        }
      } catch (e) {
        console.warn("Gagal menghapus file fisik (mungkin sudah terhapus):", fileName);
      }
    }
  }
}