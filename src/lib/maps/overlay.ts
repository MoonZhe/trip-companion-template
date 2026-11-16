'use client';

/** Plain-HTML marker. Avoids Advanced Markers, which need a Map ID, and the deprecated Marker class. */
export interface HtmlMarker {
  setPosition(p: google.maps.LatLngLiteral): void;
  setMap(map: google.maps.Map | null): void;
  element: HTMLElement;
}

export function createHtmlMarker(position: google.maps.LatLngLiteral, element: HTMLElement): HtmlMarker {
  class Overlay extends google.maps.OverlayView {
    pos = position;
    element = element;
    onAdd() {
      this.element.style.position = 'absolute';
      this.getPanes()!.overlayMouseTarget.appendChild(this.element);
    }
    draw() {
      const p = this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(this.pos));
      if (!p) return;
      this.element.style.left = `${p.x}px`;
      this.element.style.top = `${p.y}px`;
    }
    onRemove() {
      this.element.remove();
    }
    setPosition(next: google.maps.LatLngLiteral) {
      this.pos = next;
      this.draw();
    }
  }
  return new Overlay();
}
