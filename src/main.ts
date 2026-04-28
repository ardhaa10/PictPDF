import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';
import { defineCustomElements as defineJeepSqlite } from 'jeep-sqlite/loader';
import { defineCustomElements } from '@ionic/pwa-elements/loader';

// Panggil fungsi ini setelah platformBrowserDynamic
defineCustomElements(window);

// ✅ wajib sebelum bootstrap
defineJeepSqlite(window);

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch(err => console.log(err));