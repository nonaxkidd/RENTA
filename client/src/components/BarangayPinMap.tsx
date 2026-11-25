import { useEffect } from "react";
import { MapContainer, Marker, Rectangle, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CALAPAN_CENTER: [number, number] = [13.4117, 121.1803];

/** OpenStreetMap bounding box for Calapan City: south-west, north-east. */
const CALAPAN_LIMIT: L.LatLngBoundsExpression = [
  [13.274538, 121.096809],
  [13.439555, 121.275097],
];

const calapanBounds = L.latLngBounds(CALAPAN_LIMIT);

export function isInsideCalapan(lat: number, lng: number) {
  return calapanBounds.contains([lat, lng]);
}

const pinIcon = L.divIcon({
  className: "renta-pin",
  html: '<span class="renta-pin-dot"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function MapClick({
  onPick,
  onOutside,
}: {
  onPick: (lat: number, lng: number) => void;
  onOutside: () => void;
}) {
  useMapEvents({
    click(event) {
      const lat = Number(event.latlng.lat.toFixed(6));
      const lng = Number(event.latlng.lng.toFixed(6));
      if (!isInsideCalapan(lat, lng)) {
        onOutside();
        return;
      }
      onPick(lat, lng);
    },
  });
  return null;
}

function KeepInsideCalapan() {
  const map = useMap();
  useEffect(() => {
    map.setMaxBounds(calapanBounds);
    map.options.maxBoundsViscosity = 1;
  }, [map]);
  return null;
}

function MoveMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 15);
  }, [lat, lng, map]);
  return null;
}

function BarangayPinMap({
  lat,
  lng,
  onPick,
  onOutside,
}: {
  lat: number | null;
  lng: number | null;
  onPick: (lat: number, lng: number) => void;
  onOutside: () => void;
}) {
  const viewLat = lat ?? CALAPAN_CENTER[0];
  const viewLng = lng ?? CALAPAN_CENTER[1];

  return (
    <MapContainer
      center={[viewLat, viewLng]}
      zoom={lat == null ? 13 : 15}
      minZoom={12}
      maxZoom={18}
      maxBounds={CALAPAN_LIMIT}
      maxBoundsViscosity={1}
      scrollWheelZoom
      style={{ height: "280px", width: "100%", borderRadius: "16px" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Rectangle
        bounds={CALAPAN_LIMIT}
        pathOptions={{ color: "#061f29", weight: 2, dashArray: "6 6", fill: false }}
      />
      <KeepInsideCalapan />
      <MoveMap lat={viewLat} lng={viewLng} />
      <MapClick onPick={onPick} onOutside={onOutside} />
      {lat != null && lng != null && isInsideCalapan(lat, lng) && (
        <Marker position={[lat, lng]} icon={pinIcon} />
      )}
    </MapContainer>
  );
}

export default BarangayPinMap;
