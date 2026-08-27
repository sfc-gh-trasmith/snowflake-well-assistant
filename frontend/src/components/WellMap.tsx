import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Map, { Marker, Popup, Source, Layer, NavigationControl, MapRef } from 'react-map-gl';
import type { CircleLayerSpecification, FillLayerSpecification, LineLayerSpecification, SymbolLayerSpecification } from 'mapbox-gl';
import { ChevronDown, Circle, X } from 'lucide-react';
import { Well } from '../types';
import 'mapbox-gl/dist/mapbox-gl.css';

interface WellMapProps {
  wells: Well[];
  selectedWell: Well | null;
  highlightedWells: string[];
  onWellSelect: (well: Well | null) => void;
  onAskAboutWell?: (wellName: string) => void;
  onHealthClick?: (well: Well) => void;
  onPredictClick?: (well: Well) => void;
  onAreaSelect?: (wells: Well[]) => void;
  radiusCenter?: { lat: number; lon: number; radius: number } | null;
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const circleLayer: CircleLayerSpecification = {
  id: 'radius-circle',
  type: 'circle',
  source: 'radius-source',
  paint: {
    'circle-radius': 100,
    'circle-color': '#3b82f6',
    'circle-opacity': 0.2,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#3b82f6',
  },
};

const countyLineLayer: LineLayerSpecification = {
  id: 'county-lines',
  type: 'line',
  source: 'composite',
  'source-layer': 'admin',
  filter: ['all', ['==', ['get', 'admin_level'], 2], ['==', ['get', 'iso_3166_1'], 'US']],
  paint: {
    'line-color': '#f97316',
    'line-width': 2,
    'line-opacity': 0.8,
  },
};

const countyLabelLayer: SymbolLayerSpecification = {
  id: 'county-labels',
  type: 'symbol',
  source: 'county-labels-source',
  layout: {
    'text-field': ['get', 'name'],
    'text-size': 14,
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
    'text-anchor': 'center',
    'text-allow-overlap': false,
  },
  paint: {
    'text-color': '#f97316',
    'text-halo-color': '#ffffff',
    'text-halo-width': 2,
  },
};

const COUNTY_LABELS = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [-101.90, 32.30] },
      properties: { name: 'Martin County' },
    },
    {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [-102.03, 31.87] },
      properties: { name: 'Midland County' },
    },
  ],
};

const selectionFillLayer: FillLayerSpecification = {
  id: 'selection-fill',
  type: 'fill',
  source: 'selection-source',
  paint: {
    'fill-color': '#a855f7',
    'fill-opacity': 0.15,
  },
};

const selectionLineLayer: LineLayerSpecification = {
  id: 'selection-line',
  type: 'line',
  source: 'selection-source',
  paint: {
    'line-color': '#a855f7',
    'line-width': 2,
    'line-dasharray': [3, 2],
  },
};

const COUNTY_COLORS: Record<string, string> = {};
const SNOWFLAKE_PALETTE = [
  '#29B5E8', '#11567F', '#6ED5F5', '#0E4D6F', '#97E3F9',
  '#FF6F61', '#F7A072', '#FFD166', '#06D6A0', '#118AB2',
  '#073B4C', '#8338EC', '#3A86FF', '#FB5607', '#FFBE0B',
  '#E63946', '#457B9D', '#1D3557', '#2A9D8F', '#E9C46A',
];

function getCountyColor(county: string): string {
  if (!COUNTY_COLORS[county]) {
    const idx = Object.keys(COUNTY_COLORS).length % SNOWFLAKE_PALETTE.length;
    COUNTY_COLORS[county] = SNOWFLAKE_PALETTE[idx];
  }
  return COUNTY_COLORS[county];
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createCircleGeoJSON(centerLng: number, centerLat: number, radiusKm: number) {
  const points = 64;
  const coords = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(angle);
    const dy = radiusKm * Math.sin(angle);
    const lat = centerLat + (dy / 111.32);
    const lng = centerLng + (dx / (111.32 * Math.cos(centerLat * Math.PI / 180)));
    coords.push([lng, lat]);
  }
  return {
    type: 'Feature' as const,
    geometry: { type: 'Polygon' as const, coordinates: [coords] },
    properties: {},
  };
}

export default function WellMap({ wells, selectedWell, highlightedWells, onWellSelect, onAskAboutWell, onHealthClick, onPredictClick, onAreaSelect, radiusCenter }: WellMapProps) {
  const [popupWell, setPopupWell] = useState<Well | null>(null);
  const [hoveredWell, setHoveredWell] = useState<Well | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [selectedWellName, setSelectedWellName] = useState<string>('');
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState({
    longitude: -103.4,
    latitude: 31.3,
    zoom: 7,
  });

  const [fieldDropdownOpen, setFieldDropdownOpen] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawCenter, setDrawCenter] = useState<{ lng: number; lat: number } | null>(null);
  const [drawRadius, setDrawRadius] = useState<number>(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [areaSelectedWells, setAreaSelectedWells] = useState<Well[]>([]);

  const fields = useMemo(() => {
    const fieldSet = new Set(wells.map(w => w.field));
    return Array.from(fieldSet).sort();
  }, [wells]);

  const wellsInField = useMemo(() => {
    if (selectedFields.length === 0) return [];
    return wells.filter(w => selectedFields.includes(w.field)).sort((a, b) => a.well_name.localeCompare(b.well_name));
  }, [wells, selectedFields]);

  const filteredWells = useMemo(() => {
    if (selectedFields.length === 0) return wells;
    return wells.filter(w => selectedFields.includes(w.field));
  }, [wells, selectedFields]);


  const handleWellChange = (wellName: string) => {
    setSelectedWellName(wellName);
    const well = wells.find(w => w.well_name === wellName);
    if (well) {
      setPopupWell(well);
      onWellSelect(well);
      setViewState({
        longitude: well.longitude,
        latitude: well.latitude,
        zoom: 12,
      });
    }
  };

  useEffect(() => {
    if (selectedWell) {
      setViewState(prev => ({
        ...prev,
        longitude: selectedWell.longitude,
        latitude: selectedWell.latitude,
        zoom: 11,
      }));
      if (!selectedFields.includes(selectedWell.field)) {
        setSelectedFields(prev => [...prev, selectedWell.field]);
      }
      setSelectedWellName(selectedWell.well_name);
    }
  }, [selectedWell]);

  const getMarkerColor = (well: Well) => {
    if (selectedWell?.api_no === well.api_no) return '#ffffff';
    if (areaSelectedWells.length > 0 && isWellInSelection(well)) return '#a855f7';
    if (highlightedWells.includes(well.well_name)) return '#a855f7';
    if (well.status === 'SHUT-IN') return '#6b7280';
    if (well.health_score !== undefined) {
      if (well.health_score >= 85) return '#22c55e';
      if (well.health_score >= 70) return '#f59e0b';
      if (well.health_score >= 55) return '#f97316';
      return '#ef4444';
    }
    return getCountyColor(well.county);
  };

  const handleMapClick = useCallback((e: mapboxgl.MapLayerMouseEvent) => {
    if (!drawMode) return;
    if (!drawCenter) {
      setDrawCenter({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      setIsDrawing(true);
      setDrawRadius(0);
    }
  }, [drawMode, drawCenter]);

  const handleMapMouseMove = useCallback((e: mapboxgl.MapLayerMouseEvent) => {
    if (!isDrawing || !drawCenter) return;
    const dist = haversineDistance(drawCenter.lat, drawCenter.lng, e.lngLat.lat, e.lngLat.lng);
    setDrawRadius(dist);
  }, [isDrawing, drawCenter]);

  const handleMapMouseUp = useCallback(() => {
    if (!isDrawing || !drawCenter || drawRadius < 0.5) return;
    setIsDrawing(false);
    const selected = filteredWells.filter(w =>
      haversineDistance(drawCenter.lat, drawCenter.lng, w.latitude, w.longitude) <= drawRadius
    );
    setAreaSelectedWells(selected);
    if (onAreaSelect) onAreaSelect(selected);
  }, [isDrawing, drawCenter, drawRadius, filteredWells, onAreaSelect]);

  const clearSelection = () => {
    setDrawCenter(null);
    setDrawRadius(0);
    setIsDrawing(false);
    setAreaSelectedWells([]);
    setDrawMode(false);
    if (onAreaSelect) onAreaSelect([]);
  };

  const selectionGeoJSON = useMemo(() => {
    if (!drawCenter || drawRadius < 0.1) return null;
    return createCircleGeoJSON(drawCenter.lng, drawCenter.lat, drawRadius);
  }, [drawCenter, drawRadius]);

  const isWellInSelection = (well: Well) => {
    return areaSelectedWells.some(w => w.api_no === well.api_no);
  };

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-4 left-4 z-10 flex gap-2 items-start">
        <div className="relative">
          <button
            onClick={() => setFieldDropdownOpen(!fieldDropdownOpen)}
            className="flex items-center gap-2 bg-white pl-3 pr-8 py-2 rounded-lg shadow-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#29B5E8] cursor-pointer min-w-[160px] text-left"
          >
            {selectedFields.length === 0 ? 'All Fields' : `${selectedFields.length} Field${selectedFields.length > 1 ? 's' : ''}`}
          </button>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          {fieldDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-56 max-h-[280px] overflow-y-auto">
              {selectedFields.length > 0 && (
                <button
                  onClick={() => { setSelectedFields([]); setSelectedWellName(''); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 border-b border-gray-100"
                >
                  Clear All
                </button>
              )}
              {fields.map(field => (
                <label
                  key={field}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field)}
                    onChange={() => {
                      setSelectedFields(prev =>
                        prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
                      );
                      setSelectedWellName('');
                    }}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-[#29B5E8] focus:ring-[#29B5E8]"
                  />
                  <span className="text-gray-700">{field}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <select
            value={selectedWellName}
            onChange={(e) => handleWellChange(e.target.value)}
            disabled={selectedFields.length === 0}
            className="appearance-none bg-white pl-3 pr-8 py-2 rounded-lg shadow-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#29B5E8] focus:border-transparent cursor-pointer min-w-[180px] disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            <option value="">{selectedFields.length > 0 ? 'Select Well' : 'Select a field first'}</option>
            {wellsInField.map(well => (
              <option key={well.api_no} value={well.well_name}>{well.well_name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        <button
          onClick={() => { if (drawMode) clearSelection(); else setDrawMode(true); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg shadow-lg border text-sm font-medium transition-colors ${
            drawMode ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-purple-50 hover:border-purple-300'
          }`}
          title={drawMode ? 'Cancel selection' : 'Draw circle to select wells'}
        >
          <Circle className="w-4 h-4" />
          {drawMode ? 'Cancel' : 'Select Area'}
        </button>
      </div>

      {areaSelectedWells.length > 0 && !isDrawing && (
        <div className="absolute top-4 right-14 z-10 bg-white rounded-lg shadow-lg border border-purple-200 px-4 py-2.5 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span className="text-sm font-medium text-gray-900">{areaSelectedWells.length} wells selected</span>
          </div>
          <button onClick={clearSelection} className="p-1 hover:bg-gray-100 rounded transition-colors" title="Clear selection">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      )}

      {drawMode && !drawCenter && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
          Click on the map to set center, then drag to set radius
        </div>
      )}

      {drawMode && drawCenter && isDrawing && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
          Drag to expand circle ({drawRadius.toFixed(1)} km) — release to confirm
        </div>
      )}
      
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => { if (!isDrawing) setViewState(evt.viewState); }}
        onClick={handleMapClick}
        onMouseMove={handleMapMouseMove}
        onMouseUp={handleMapMouseUp}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        cursor={drawMode ? 'crosshair' : undefined}
        dragPan={!isDrawing}
      >
        <NavigationControl position="top-right" />

        <Layer {...countyLineLayer} />
        
        <Source id="county-labels-source" type="geojson" data={COUNTY_LABELS}>
          <Layer {...countyLabelLayer} />
        </Source>
        
        {radiusCenter && (
          <Source
            type="geojson"
            data={{
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [radiusCenter.lon, radiusCenter.lat],
              },
              properties: {},
            }}
          >
            <Layer {...circleLayer} />
          </Source>
        )}

        {selectionGeoJSON && (
          <Source id="selection-source" type="geojson" data={selectionGeoJSON}>
            <Layer {...selectionFillLayer} />
            <Layer {...selectionLineLayer} />
          </Source>
        )}

        {filteredWells.map(well => (
          <Marker
            key={well.api_no}
            longitude={well.longitude}
            latitude={well.latitude}
            anchor="center"
            onClick={e => {
              e.originalEvent.stopPropagation();
              setPopupWell(well);
              setHoveredWell(null);
              onWellSelect(well);
              if (!selectedFields.includes(well.field)) setSelectedFields(prev => [...prev, well.field]);
              setSelectedWellName(well.well_name);
            }}
          >
            <div
              className="cursor-pointer transition-transform hover:scale-125"
              onMouseEnter={() => { if (!popupWell) setHoveredWell(well); }}
              onMouseLeave={() => setHoveredWell(null)}
              style={{
                width: selectedWell?.api_no === well.api_no ? 16 : 10,
                height: selectedWell?.api_no === well.api_no ? 16 : 10,
                backgroundColor: getMarkerColor(well),
                borderRadius: '50%',
                border: 'none',
                boxShadow: 'none',
              }}
            />
          </Marker>
        ))}

        {hoveredWell && !popupWell && (
          <Popup
            longitude={hoveredWell.longitude}
            latitude={hoveredWell.latitude}
            anchor="bottom"
            closeButton={false}
            closeOnClick={false}
            offset={12}
          >
            <div className="px-3 py-2 text-xs">
              <p className="font-bold text-gray-900 text-sm">{hoveredWell.well_name}</p>
              <p className="text-gray-600 mt-0.5"><span className="font-medium">Field:</span> {hoveredWell.field}</p>
              <p className="text-gray-600"><span className="font-medium">API:</span> {hoveredWell.api_no}</p>
              <p className="text-gray-600"><span className="font-medium">Lat/Long:</span> {hoveredWell.latitude.toFixed(4)}, {hoveredWell.longitude.toFixed(4)}</p>
            </div>
          </Popup>
        )}

        {popupWell && (
          <Popup
            longitude={popupWell.longitude}
            latitude={popupWell.latitude}
            anchor="bottom"
            onClose={() => setPopupWell(null)}
            closeButton={true}
            closeOnClick={false}
            maxWidth="380px"
          >
            <div className="p-4 min-w-[340px]">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 text-base">{popupWell.well_name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  popupWell.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {popupWell.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{popupWell.api_no}</p>

              {popupWell.health_score !== undefined && (
                <div className="mt-3 flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <div
                    className="w-3.5 h-3.5 rounded-full"
                    style={{
                      backgroundColor: popupWell.health_status === 'GREEN' ? '#22c55e' :
                        popupWell.health_status === 'YELLOW' ? '#f59e0b' :
                        popupWell.health_status === 'ORANGE' ? '#f97316' : '#ef4444'
                    }}
                  />
                  <span className="text-sm font-bold flex-1">
                    Health Score: {popupWell.health_score}%
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    popupWell.health_status === 'GREEN' ? 'bg-green-100 text-green-800' :
                    popupWell.health_status === 'YELLOW' ? 'bg-amber-100 text-amber-800' :
                    popupWell.health_status === 'ORANGE' ? 'bg-orange-100 text-orange-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {popupWell.health_status}
                  </span>
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <p><span className="font-medium text-gray-500">Field:</span> {popupWell.field}</p>
                <p><span className="font-medium text-gray-500">County:</span> {popupWell.county}</p>
                <p><span className="font-medium text-gray-500">Formation:</span> {popupWell.formation}</p>
                <p><span className="font-medium text-gray-500">Operator:</span> {popupWell.operator}</p>
                {popupWell.tvd_ft && (
                  <p><span className="font-medium text-gray-500">TVD:</span> {popupWell.tvd_ft.toLocaleString()} ft</p>
                )}
                {popupWell.lateral_length_ft && (
                  <p><span className="font-medium text-gray-500">Lateral:</span> {popupWell.lateral_length_ft.toLocaleString()} ft</p>
                )}
              </div>

              <div className="mt-3 flex gap-2">
                {onHealthClick && (
                  <button
                    onClick={() => onHealthClick(popupWell)}
                    className="flex-1 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded hover:bg-gray-700 transition-colors"
                  >
                    Well History
                  </button>
                )}
                {onPredictClick && (
                  <button
                    onClick={() => onPredictClick(popupWell)}
                    className="flex-1 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded hover:bg-purple-700 transition-colors"
                  >
                    Sensitivity Analysis
                  </button>
                )}
                {onAskAboutWell && (
                  <button
                    onClick={() => onAskAboutWell(popupWell.well_name)}
                    className="flex-1 px-3 py-1.5 bg-[#29B5E8] text-white text-xs font-medium rounded hover:bg-opacity-90 transition-colors"
                  >
                    Ask AI
                  </button>
                )}
              </div>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
