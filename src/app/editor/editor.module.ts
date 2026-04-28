import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { DragDropModule } from '@angular/cdk/drag-drop'; // 🔥 WAJIB

import { EditorPageRoutingModule } from './editor-routing.module';
import { EditorPage } from './editor.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    EditorPageRoutingModule,
    DragDropModule // 🔥 HARUS ADA DI SINI
  ],
  declarations: [EditorPage]
})
export class EditorPageModule {}