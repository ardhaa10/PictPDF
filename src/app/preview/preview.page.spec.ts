import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PreviewPage } from './preview.page';

describe('PreviewPage', () => {
  let component: PreviewPage;
  let fixture: ComponentFixture<PreviewPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PreviewPage ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PreviewPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
