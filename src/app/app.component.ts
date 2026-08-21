import { Component } from '@angular/core';
import { PwaUpdateService } from './services/pwa-update.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  constructor(private readonly pwaUpdate: PwaUpdateService) {
    this.pwaUpdate.init();
  }
}
