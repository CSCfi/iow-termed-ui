import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { ConceptViewModelService } from '../services/concept.view.service';
import { SessionService } from '../services/session.service';

@Component({
  selector: 'concepts',
  styleUrls: ['./concepts.component.scss'],
  providers: [ConceptViewModelService],
  template: `
    <div class="container-fluid">

      <ajax-loading-indicator *ngIf="loading"></ajax-loading-indicator>

      <div [hidden]="loading">

        <div class="row">
          <div class="col-12">
            <vocabulary></vocabulary>
          </div>
        </div>
  
        <div class="bottom">
        
          <div class="panel-left">
            <div float>
              <ngb-tabset>
                <ngb-tab>
                  <template ngbTabTitle>
                    <i class="fa fa-sort-alpha-asc"></i>
                    <p>{{'Alphabetic' | translate}}</p>
                  </template>
                  <template ngbTabContent><concept-list></concept-list></template>
                </ngb-tab>
                <ngb-tab>
                  <template ngbTabTitle>
                    <i class="fa fa-sitemap"></i>
                    <p>{{'Hierarchical' | translate}}</p>
                  </template>
                  <template ngbTabContent><concept-hierarchy></concept-hierarchy></template>
                </ngb-tab>
              </ngb-tabset>
            </div>
          </div>

          <div class="panel-right">
            
            <div class="selection-container" [style.width]="selectionWidth" [hidden]="!showSelection">
              <router-outlet></router-outlet>
            </div>

            <div class="visualization-container" [style.width]="visualizationWidth">
              <div float>
                <divider *ngIf="showDivider"></divider>
                <concept-network [class.without-divider]="!showDivider"></concept-network>
              </div>
            </div>
            
          </div>

        </div>
      
      </div>
      
    </div>
  `
})
export class ConceptsComponent implements OnInit {

  constructor(private route: ActivatedRoute,
              private viewModel: ConceptViewModelService,
              private sessionService: SessionService,
              private domSanitizer: DomSanitizer) {
  }

  get loading() {
    return this.viewModel.loadingConceptScheme || this.viewModel.loadingConcepts;
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.viewModel.initializeConceptScheme(params['graphId']);
    });
  }

  get showDivider() {
    return this.showSelection;
  }

  get showSelection() {
    return !!this.viewModel.concept;
  }

  get selectionWidth() {
    return this.sessionService.selectionWidth + 'px';
  }

  get visualizationWidth() {
    return this.domSanitizer.bypassSecurityTrustStyle(
      this.showSelection ? `calc(100% - ${this.sessionService.selectionWidth}px)` : '100%'
    );
  }
}

