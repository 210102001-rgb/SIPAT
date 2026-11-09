"use client";

import { useEffect, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const SURAKARTA: [number, number] = [-7.5595, 110.8298];

const pinIcon = L.divIcon({
  className: "",
  html: `<span style="display:block;width:22px;height:22px;border-radius:9999px 9999px 9999px 0;background:#22D3EE;border:2px solid #05070B;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,.5)"></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

export default function LocationPicker({ lat, lng, onChange }: LocationPickerProps) {
  const [gmapsLink, setGmapsLink] = useState("");
  const [gmapsMsg, setGmapsMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const hasCoords =
    lat !== null && lng !== null && !Number.isNaN(lat) && !Number.isNaN(lng);
  const center: [number, number] = hasCoords ? [lat as number, lng as number] : SURAKARTA;

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoMsg("Browser ini tidak mendukung geolokasi.");
      return;
    }
    setLocating(true);
    setGeoMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange(pos.coords.latitude, pos.coords.longitude);
        setGeoMsg("Lokasi Anda berhasil diambil.");
      },
      (err) => {
        setLocating(false);
        setGeoMsg(
          err.code === err.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan izin lokasi di browser lalu coba lagi."
            : "Gagal mengambil lokasi. Coba klik di peta atau tempel link Google Maps."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function parseGmapsLink(link: string): { lat: number; lng: number } | null {
    // Pola 1: @lat,lng — URL place/maps dengan @
    const at = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
    // Pola 2: ?q=lat,lng / &query=lat,lng / ?ll=lat,lng
    const q = link.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (q) return { lat: parseFloat(q[1]), lng: parseFloat(q[2]) };
    // Pola 3: /data=...!3dlat!4dlng
    const d = link.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (d) return { lat: parseFloat(d[1]), lng: parseFloat(d[2]) };
    return null;
  }

  function applyGmapsLink() {
    const trimmed = gmapsLink.trim();
    if (!trimmed) {
      setGmapsMsg({ kind: "err", text: "Tempel dulu link Google Maps-nya." });
      return;
    }
    if (trimmed.includes("maps.app.goo.gl") || trimmed.includes("goo.gl/maps")) {
      setGmapsMsg({
        kind: "err",
        text: "Link pendek (maps.app.goo.gl) tidak bisa dibaca langsung. Buka link itu di browser, lalu salin URL lengkapnya dari address bar.",
      });
      return;
    }
    const coords = parseGmapsLink(trimmed);
    if (!coords) {
      setGmapsMsg({
        kind: "err",
        text: "Koordinat tidak ditemukan di link itu. Pastikan link berisi lokasi (ada angka lat,lng), atau klik langsung di peta.",
      });
      return;
    }
    onChange(coords.lat, coords.lng);
    setGmapsMsg({
      kind: "ok",
      text: `Koordinat diambil: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="rounded-md border border-[#22D3EE]/50 bg-[#22D3EE]/10 px-3 py-2 text-sm font-medium text-[#67E8F9] hover:bg-[#22D3EE]/20 disabled:opacity-50"
      >
        {locating ? "Mengambil lokasi…" : "📍 Gunakan Lokasi Saya"}
      </button>
      {geoMsg && <p className="text-xs text-[#94A3B8]">{geoMsg}</p>}

      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={false}
        className="h-[240px] w-full rounded-lg border border-[#1E293B]"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onPick={onChange} />
        {hasCoords && <Recenter lat={lat as number} lng={lng as number} />}
        {hasCoords && (
          <Marker
            position={[lat as number, lng as number]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target as L.Marker;
                const p = marker.getLatLng();
                onChange(p.lat, p.lng);
              },
            }}
          />
        )}
      </MapContainer>
      <p className="text-xs text-[#94A3B8]">
        Klik di peta untuk menaruh pin, atau geser pin-nya. Koordinat:{" "}
        <span className="font-mono text-[#F1F5F9]">
          {hasCoords
            ? `${(lat as number).toFixed(6)}, ${(lng as number).toFixed(6)}`
            : "belum dipilih"}
        </span>
        {hasCoords && (
          <>
            {" · "}
            <a
              href={`https://www.google.com/maps?q=${lat},${lng}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[#22D3EE] underline"
            >
              Cek di Google Maps ↗
            </a>
          </>
        )}
      </p>

      <div>
        <label
          htmlFor="loc-gmaps"
          className="mb-1 block text-xs font-medium text-[#94A3B8]"
        >
          Atau tempel link Google Maps
        </label>
        <div className="flex gap-2">
          <input
            id="loc-gmaps"
            type="url"
            value={gmapsLink}
            onChange={(e) => setGmapsLink(e.target.value)}
            placeholder="https://www.google.com/maps/place/…/@-7.55,110.82,17z"
            className="w-full rounded-md border border-[#1E293B] bg-[#05070B] px-3 py-2 text-sm text-[#F1F5F9] placeholder-[#64748B] focus:border-[#22D3EE] focus:outline-none"
          />
          <button
            type="button"
            onClick={applyGmapsLink}
            className="shrink-0 rounded-md border border-[#1E293B] px-3 py-2 text-sm font-medium text-[#F1F5F9] hover:bg-[#10151F]"
          >
            Ambil
          </button>
        </div>
        {gmapsMsg && (
          <p
            className={`mt-1 text-xs ${
              gmapsMsg.kind === "ok" ? "text-[#86EFAC]" : "text-[#FCA5A5]"
            }`}
          >
            {gmapsMsg.text}
          </p>
        )}
      </div>
    </div>
  );
}
