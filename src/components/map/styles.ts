// Quiet map styles so our pins and route stand out. Business POIs are hidden to reduce clutter.
type Style = google.maps.MapTypeStyle[];

export const LIGHT_STYLE: Style = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ saturation: -80 }, { lightness: 20 }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ saturation: -60 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfe0ea' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f6f1e9' }] },
];

export const DARK_STYLE: Style = [
  { elementType: 'geometry', stylers: [{ color: '#1f1a17' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9c9087' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#15110f' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#262019' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1c2a24' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#382f2a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#463b34' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#463b34' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#c9bdb2' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f2230' }] },
];
