"use client";

import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import type { DeviceRow, LocationRow } from "@/lib/types";

interface MapViewProps {
  locations: LocationRow[];
  devices: DeviceRow[];
}

const SURAKARTA: [number, number] = [-7.5595, 110.8298];

function dotIcon(online: boolean): L.DivIcon {
  const color = online ? "#22C55E" : "#64748B";
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #05070B;box-shadow:0 0 0 2px ${color}55"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

export default function MapView({ locations, devices }: MapViewProps) {
  const center: [number, number] =
    locations.length > 0 ? [locations[0].lat, locations[0].lng] : SURAKARTA;

  return (
    <MapContainer
      center={center}
      zoom={13}
      scrollWheelZoom
      className="h-[calc(100vh-220px)] min-h-[420px] w-full rounded-xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {locations.map((loc) => {
        const locDevices = devices.filter((d) => d.location_id === loc.id);
        const onlineCount = locDevices.filter((d) => d.status === "online").length;
        return (
          <Marker key={loc.id} position={[loc.lat, loc.lng]} icon={dotIcon(onlineCount > 0)}>
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{loc.name}</p>
                <p className="text-slate-600">{loc.address}</p>
                <p className="mt-1 text-slate-600">
                  {locDevices.length} perangkat · {onlineCount} online
                </p>
                <Link href="/monitoring" className="mt-1 inline-block font-medium text-cyan-700">
                  Buka Monitoring →
                </Link>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
