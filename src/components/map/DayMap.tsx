'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bed, Crosshair, MapPinArea, NavigationArrow, TrainSimple } from '@phosphor-icons/react';
import type { Day, Hotel, Stop } from '@/lib/sheet/types';
import { useTripData } from '@/components/providers/TripData';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { correctPlace, loadMaps, resolvePlaces, type Place } from '@/lib/maps/google';
import { createHtmlMarker, type HtmlMarker } from '@/lib/maps/overlay';
import { placeQuery } from '@/lib/trip/places';
import { forgetStation, useStations, type Station } from '@/lib/maps/stations';
import { forgetHours } from '@/lib/maps/hours';
import { directionsUrl, hotelDirectionsUrl, cityForStop } from '@/lib/trip/city';
import { DARK_STYLE, LIGHT_STYLE } from './styles';

interface Pin {
  key: string;
  n: number;
  query: string;
  stop?: Stop;
  hotel?: Hotel;
}

/** The day's planned route as numbered pins, plus our live location on request. */
export function DayMap({ day, hotel, currentKey }: { day: Day; hotel: Hotel | null; currentKey?: string }) {
  const { checks, online } = useTripData();
  const sb = supabaseBrowser();
  const box = useRef<HTMLDivElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [places, setPlaces] = useState<Map<string, Place>>(new Map());
  const stations = useStations(day);
  const [selected, setSelected] = useState<string | null>(null);
  const [taps, setTaps] = useState(0); // re-tapping the same pin should still scroll to its card
  const select = (key: string) => {
    setSelected(key);
    setTaps((t) => t + 1);
  };
  const [me, setMe] = useState<GeolocationPosition | null>(null);
  const [locating, setLocating] = useState(false);
  const watch = useRef<number | null>(null);
  const routeBounds = useRef<google.maps.LatLngBounds | null>(null);
  const hotelPos = useRef<google.maps.LatLngLiteral | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const fitted = useRef(''); // what the map last zoomed to fit, so ticks and syncs don't reset the view

  // The pin card sits below a tall map, off screen on a phone, so bring it into view on each tap.
  useEffect(() => {
    if (!taps) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [taps]);

  // The options picked for this day, as a string: a new checks Set from a tick or sync
  // shouldn't rebuild the pins unless a choice actually changed.
  const choices = day.stops
    .filter((s) => s.isOption && checks.has(`choice-d${day.day}:${s.key}`))
    .map((s) => s.key)
    .join('|');
  const pins = useMemo<Pin[]>(() => {
    const picked = new Set(choices.split('|'));
    const chosen = (s: Stop) => !s.isOption || picked.has(s.key);
    const list: Pin[] = [];
    for (const s of day.stops.filter(chosen)) {
      const query = placeQuery(s, cityForStop(day, s));
      if (query) list.push({ key: s.key, n: list.length + 1, query, stop: s });
    }
    if (hotel) list.push({ key: 'hotel', n: 0, query: `${hotel.name}, Japan`, hotel });
    return list;
  }, [day, hotel, choices]);
  const queries = pins.map((p) => p.query).join('\n');
  const unpinned = day.stops.filter((s) => !s.isOption).length - pins.filter((p) => p.stop).length;

  // Create the map once. Opened offline (or a load failed), it tries again when the connection
  // comes back or on "Try again".
  useEffect(() => {
    if (map.current || !online) return;
    let cancelled = false;
    let frame = 0;
    setError(null);
    loadMaps()
      .then(({ Map }) => {
        if (cancelled || map.current) return;
        // The map box isn't on screen yet: try again on the next frame rather than stay blank.
        if (!mapEl.current) return void (frame = requestAnimationFrame(() => setRetry((r) => r + 1)));
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        map.current = new Map(mapEl.current, {
          center: { lat: 35.0, lng: 135.77 },
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
          clickableIcons: false,
          gestureHandling: 'greedy',
          styles: dark ? DARK_STYLE : LIGHT_STYLE,
          backgroundColor: dark ? '#15110f' : '#f6f1e9',
        });
        setReady(true);
      })
      .catch(() => setError('The map could not load. Check your connection and try again.'));
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [online, retry]);

  // Look up any places we have not pinned before. Results are merged in, so a lookup that fails
  // (offline on a train) never wipes pins we already have.
  useEffect(() => {
    if (!ready || !queries) return;
    let cancelled = false;
    resolvePlaces(sb, queries.split('\n'))
      .then((m) => {
        if (cancelled) return;
        setPlaces((prev) => {
          const next = new Map(prev);
          m.forEach((v, k) => next.set(k, v));
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setPlaces((prev) => {
          if (!prev.size) setError('Could not find the places for this day.');
          return prev;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [ready, queries, sb]);

  // Draw pins and the route.
  useEffect(() => {
    const m = map.current;
    if (!m || !places.size) return;
    const accent = getComputedStyle(box.current!).getPropertyValue('--accent').trim() || '#2D4563';
    const markers: HtmlMarker[] = [];
    const roots: ReturnType<typeof createRoot>[] = [];
    const bounds = new google.maps.LatLngBounds();
    const all = new google.maps.LatLngBounds();
    hotelPos.current = null;
    const path: google.maps.LatLngLiteral[] = [];

    for (const pin of pins) {
      const place = places.get(pin.query);
      if (!place || place.lat == null || place.lng == null) continue;
      const pos = { lat: place.lat, lng: place.lng };
      all.extend(pos);
      if (pin.hotel) hotelPos.current = pos;
      else bounds.extend(pos);
      const el = document.createElement('button');
      el.type = 'button';
      el.onclick = () => select(pin.key);
      const done = pin.stop ? checks.has(pin.stop.key) : false;
      const current = pin.key === currentKey;
      el.className = pin.hotel
        ? '-translate-x-1/2 -translate-y-1/2 flex h-9 items-center gap-1.5 rounded-full border-2 border-white px-3 text-sm font-semibold text-white shadow-[0_2px_8px_rgb(0_0_0/0.35)]'
        : `-translate-x-1/2 -translate-y-1/2 grid place-items-center rounded-full border-2 border-white font-semibold text-white shadow-[0_2px_8px_rgb(0_0_0/0.35)] ${
            current ? 'size-10 text-base ring-4 ring-white/60' : 'size-8 text-sm'
          }`;
      el.style.background = pin.hotel ? '#16181d' : done ? '#8b9099' : accent;
      el.style.zIndex = '2';
      el.setAttribute('aria-label', pin.hotel ? `Hotel: ${pin.hotel.name}` : `Stop ${pin.n}: ${pin.stop!.title}`);
      if (pin.hotel) {
        const root = createRoot(el);
        root.render(
          <>
            <Bed size={16} weight="bold" />
            Hotel
          </>,
        );
        roots.push(root);
      } else {
        el.textContent = String(pin.n);
        path.push(pos);
      }
      const marker = createHtmlMarker(pos, el);
      marker.setMap(m);
      markers.push(marker);
    }

    const route = new google.maps.Polyline({
      path,
      map: m,
      strokeColor: accent,
      strokeOpacity: 0.75,
      strokeWeight: 4,
      geodesic: true,
    });
    routeBounds.current = bounds.isEmpty() ? null : bounds;
    // First view shows the whole day including where we sleep. Only refit when the day or its
    // pins change, not on every tick, so a zoomed-in view stays put.
    const fit = `${day.day}|${pins.map((p) => `${p.query}@${places.get(p.query)?.lat},${places.get(p.query)?.lng}`).join('|')}`;
    if (!all.isEmpty() && fitted.current !== fit) {
      fitted.current = fit;
      m.fitBounds(all, 48);
    }

    return () => {
      markers.forEach((mk) => mk.setMap(null));
      route.setMap(null);
      setTimeout(() => roots.forEach((r) => r.unmount()));
    };
  }, [places, pins, checks, currentKey, day.day]);

  // Nearest stations: a small train marker each (shared stations drawn once), joined to their stops
  // by a faint dotted walking line, under the stop pins. Names appear once zoomed in (15+), so
  // they don't crowd the pins on the whole-day view.
  useEffect(() => {
    const m = map.current;
    if (!m || !places.size || !stations.size) return;
    const accent = getComputedStyle(box.current!).getPropertyValue('--accent').trim() || '#2D4563';
    const markers: HtmlMarker[] = [];
    const roots: ReturnType<typeof createRoot>[] = [];
    const lines: google.maps.Polyline[] = [];
    const drawn = new Set<string>();
    const names: HTMLElement[] = [];
    const showNames = () => {
      const on = (m.getZoom() ?? 0) >= 15;
      names.forEach((n) => (n.style.display = on ? '' : 'none'));
    };

    for (const pin of pins) {
      const st = pin.stop && stations.get(pin.stop.key);
      const place = places.get(pin.query);
      if (!st || place?.lat == null || place.lng == null) continue;
      const stationPos = { lat: st.lat, lng: st.lng };
      lines.push(
        new google.maps.Polyline({
          map: m,
          path: [{ lat: place.lat, lng: place.lng }, stationPos],
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.7, strokeColor: accent, scale: 2 },
              offset: '0',
              repeat: '8px',
            },
          ],
          clickable: false,
        }),
      );
      if (drawn.has(st.name)) continue;
      drawn.add(st.name);
      const el = document.createElement('div');
      el.className =
        '-translate-x-1/2 -translate-y-1/2 flex items-center gap-1 whitespace-nowrap rounded-full border border-[#d4d4cf] bg-white/95 p-0.5 text-[11px] font-semibold text-[#16181d] shadow-[0_1px_4px_rgb(0_0_0/0.25)]';
      el.style.zIndex = '1';
      el.setAttribute('aria-label', `${st.name} station`);
      const root = createRoot(el);
      root.render(
        <>
          <span className="grid size-4 place-items-center rounded-full text-white" style={{ background: accent }}>
            <TrainSimple size={10} weight="bold" />
          </span>
          <span ref={(n) => void (n && names.push(n))} className="pr-1.5">
            {st.name}
          </span>
        </>,
      );
      roots.push(root);
      const marker = createHtmlMarker(stationPos, el);
      marker.setMap(m);
      markers.push(marker);
    }

    // React renders the labels a tick later; apply the zoom rule once they exist, then on zoom.
    const first = setTimeout(showNames);
    const zoom = m.addListener('zoom_changed', showNames);

    return () => {
      clearTimeout(first);
      zoom.remove();
      markers.forEach((mk) => mk.setMap(null));
      lines.forEach((l) => l.setMap(null));
      setTimeout(() => roots.forEach((r) => r.unmount()));
    };
  }, [places, pins, stations]);

  // Live location: only after the user asks, and only while the map is on screen.
  useEffect(() => {
    const m = map.current;
    if (!m || !me) return;
    const pos = { lat: me.coords.latitude, lng: me.coords.longitude };
    const dot = document.createElement('div');
    dot.className = '-translate-x-1/2 -translate-y-1/2 size-4 rounded-full border-2 border-white bg-[#2563eb] shadow';
    const marker = createHtmlMarker(pos, dot);
    marker.setMap(m);
    const ring = new google.maps.Circle({
      map: m,
      center: pos,
      radius: me.coords.accuracy,
      strokeWeight: 0,
      fillColor: '#2563eb',
      fillOpacity: 0.12,
      clickable: false,
    });
    return () => {
      marker.setMap(null);
      ring.setMap(null);
    };
  }, [me]);

  useEffect(
    () => () => {
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    },
    [],
  );

  function locate() {
    if (!('geolocation' in navigator)) return setError('This phone does not share its location with the browser.');
    if (watch.current !== null) {
      // Already watching: pan to us, or wait for the first fix rather than start a second watch.
      if (me) map.current?.panTo({ lat: me.coords.latitude, lng: me.coords.longitude });
      return;
    }
    setLocating(true);
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setMe((prev) => {
          if (!prev) map.current?.panTo({ lat: p.coords.latitude, lng: p.coords.longitude });
          return p;
        });
        setLocating(false);
      },
      () => {
        // Stop the failed watch so a later tap can ask again cleanly.
        if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
        setLocating(false);
        setError('Location is off. Allow location for this site in your browser settings.');
      },
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );
  }

  const pick = pins.find((p) => p.key === selected);

  if (!online && !ready)
    return (
      <p className="rounded-[24px] border border-line bg-card p-5 text-[15px] text-ink-soft">
        The map needs a connection. The list view works offline.
      </p>
    );

  return (
    <div ref={box} className="grid gap-3">
      <div className="relative overflow-hidden rounded-[28px] border border-line bg-sunk">
        <div ref={mapEl} className="h-[58dvh] min-h-80 w-full" aria-label={`Map of Day ${day.day}`} />
        {!places.size && !error && (
          <div className="absolute inset-0 grid place-items-center text-sm text-ink-faint">Finding places…</div>
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          {places.size > 0 && (
            <button
              onClick={() => routeBounds.current && map.current?.fitBounds(routeBounds.current, 48)}
              className="min-h-12 rounded-full bg-card px-4 text-[15px] font-semibold text-ink shadow-soft active:scale-95"
            >
              Route
            </button>
          )}
          {hotel && (
            <button
              onClick={() => {
                if (!hotelPos.current) return;
                map.current?.panTo(hotelPos.current);
                map.current?.setZoom(15);
                select('hotel');
              }}
              className="flex min-h-12 items-center gap-1.5 rounded-full bg-card px-4 text-[15px] font-semibold text-ink shadow-soft active:scale-95"
            >
              <Bed size={18} />
              Hotel
            </button>
          )}
        </div>
        <button
          onClick={locate}
          className="absolute top-3 right-3 flex min-h-12 items-center gap-2 rounded-full bg-card px-4 text-[15px] font-semibold text-ink shadow-soft active:scale-95"
        >
          <Crosshair size={20} weight="bold" className={locating ? 'animate-pulse' : ''} />
          {me ? 'Us' : 'Find us'}
        </button>
      </div>

      {error && (
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-soft">
          {error}
          {!ready && (
            <button
              type="button"
              onClick={() => setRetry((r) => r + 1)}
              className="min-h-12 font-semibold text-ink underline underline-offset-2"
            >
              Try again
            </button>
          )}
        </p>
      )}

      {pick ? (
        // Scroll margin clears the bottom tab bar and the floating add button.
        <div ref={card} className="scroll-mb-[calc(10rem+env(safe-area-inset-bottom))]">
          <PinCard
            key={pick.key}
            pin={pick}
            dayCity={day.city}
            station={pick.stop ? stations.get(pick.stop.key) : undefined}
            onFixed={(p) => {
              setPlaces((prev) => new Map(prev).set(p.query, p));
              void forgetStation(p.query);
              void forgetHours(p.query);
            }}
          />
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-ink-faint">
          <MapPinArea size={16} />
          Tap a pin for details.{unpinned > 0 ? ` ${unpinned} stops like meals and train rides have no pin.` : ''}
        </p>
      )}
    </div>
  );
}

function PinCard({
  pin,
  dayCity,
  station,
  onFixed,
}: {
  pin: Pin;
  dayCity: string;
  station?: Station;
  onFixed: (p: Place) => void;
}) {
  const sb = supabaseBrowser();
  const [fixing, setFixing] = useState(false);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const href = pin.hotel ? hotelDirectionsUrl(pin.hotel) : directionsUrl(pin.stop!, dayCity);

  return (
    <article className="grid gap-3 rounded-[24px] border border-line bg-card p-5">
      <div>
        <p className="text-sm font-medium text-ink-faint">{pin.hotel ? 'Tonight' : `Stop ${pin.n} · ${pin.stop!.time}`}</p>
        <h3 className="mt-0.5 text-lg leading-snug font-semibold">{pin.hotel?.name ?? pin.stop!.title}</h3>
        {station && (
          <p className="mt-1.5 flex items-center gap-2 text-sm text-ink-soft">
            <TrainSimple size={16} weight="fill" className="shrink-0 text-accent-text" />
            <span>
              Nearest station: <span className="font-semibold text-ink">{station.name}</span> · {station.walkMin} min walk
            </span>
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-accent-ink active:scale-[0.98]"
        >
          <NavigationArrow size={18} weight="fill" />
          Directions
        </a>
        <button
          onClick={() => setFixing((f) => !f)}
          className="inline-flex min-h-12 items-center rounded-full border border-line px-5 text-[15px] font-medium active:scale-[0.98]"
        >
          Wrong spot?
        </button>
      </div>
      {fixing && (
        <form
          className="grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            setMsg('Searching…');
            const fixed = await correctPlace(sb, pin.query, `${text.trim()}, Japan`);
            if (fixed) {
              onFixed(fixed);
              setMsg(`Moved to ${fixed.label ?? 'the new spot'}.`);
              setFixing(false);
            } else setMsg('Nothing found. Try the name as it appears on Google Maps.');
          }}
        >
          <label htmlFor="fix" className="text-sm font-medium text-ink-soft">
            Search for the right place
          </label>
          <div className="flex gap-2">
            <input
              id="fix"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Itsukichaya Arashiyama"
              className="min-h-12 flex-1 rounded-2xl border border-line bg-paper px-4 text-[16px] outline-none focus:ring-2 focus:ring-accent"
            />
            <button type="submit" className="min-h-12 rounded-full bg-ink px-5 text-[15px] font-semibold text-paper">
              Move
            </button>
          </div>
        </form>
      )}
      {msg && <p className="text-sm text-ink-faint">{msg}</p>}
    </article>
  );
}
