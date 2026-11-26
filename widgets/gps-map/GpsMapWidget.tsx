import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { WidgetEmptyState } from '../../components/WidgetEmptyState';
import { useRosStore } from '../../stores/useRosStore';
import type { WidgetProps } from '../../types/layout';

const TILES: Record<string, [string, string]> = {
  satellite: [
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    'Imagery &copy; Esri',
  ],
  street: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; OpenStreetMap contributors'],
};

// Fix status (sensor_msgs/NavSatStatus) → colour: no fix, GPS, SBAS, GBAS/RTK.
const html = (tiles: [string, string]) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;background:#111}
.rc{background:#222;color:#eee;font:13px monospace;padding:4px 8px;border-radius:4px;cursor:pointer}</style>
</head><body><div id="m"></div><script>
var COL={'-1':'#888','0':'#fbbf24','1':'#22d3ee','2':'#22c55e'};
var map=L.map('m',{zoomControl:false,attributionControl:true}).setView([0,0],2);
L.tileLayer('${tiles[0]}',{maxZoom:20,maxNativeZoom:19,attribution:'${tiles[1]}'}).addTo(map);
var track=L.polyline([],{color:'#60a5fa',weight:3}).addTo(map);
var acc=L.circle([0,0],{radius:0,weight:1,fillOpacity:0.15});
var dot=L.circleMarker([0,0],{radius:7,weight:2,color:'#fff',fillOpacity:1});
var follow=true, first=true;
map.on('dragstart',function(){follow=false;});
var Rc=L.Control.extend({onAdd:function(){var d=L.DomUtil.create('div','rc');d.textContent='◎ follow';
  L.DomEvent.on(d,'click',function(e){L.DomEvent.stop(e);follow=true;if(dot._map)map.panTo(dot.getLatLng());});return d;}});
new Rc({position:'topright'}).addTo(map);
window.fix=function(lat,lon,st,sigma){
  var p=[lat,lon];
  if(!dot._map){dot.addTo(map);acc.addTo(map);}
  dot.setLatLng(p).setStyle({fillColor:COL[st]||COL['0']});
  acc.setLatLng(p).setRadius(sigma||0);
  var pts=track.getLatLngs(); pts.push(L.latLng(p)); if(pts.length>2000)pts.shift(); track.setLatLngs(pts);
  if(first){map.setView(p,18);first=false;} else if(follow)map.panTo(p,{animate:false});
};
</script></body></html>`;

interface NavSatFix {
  latitude: number;
  longitude: number;
  status: { status: number };
  position_covariance: ArrayLike<number>;
  position_covariance_type: number;
}

export function GpsMapWidget(props: Partial<WidgetProps>) {
  const transport = useRosStore((s) => s.transport);
  const status = useRosStore((s) => s.connection.status);
  const topic = props.config?.topic || '/gps/fix';
  const tiles = TILES[props.config?.tiles] ?? TILES.satellite;
  const web = useRef<WebView>(null);
  const [gotFix, setGotFix] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);

  useEffect(() => {
    if (!transport || status !== 'connected') return;
    let last = 0;
    const sub = transport.subscribe(topic, 'sensor_msgs/msg/NavSatFix', (m: NavSatFix) => {
      const now = Date.now();
      // ponytail: 5 Hz is plenty for a map dot; no fix means lat/lon are meaningless.
      if (now - last < 200 || m.status.status < 0 || !isFinite(m.latitude)) return;
      last = now;
      setGotFix(true);
      // 1-sigma horizontal accuracy from the east/north variances, when the driver reports them.
      const c = m.position_covariance;
      const sigma = m.position_covariance_type > 0 ? Math.sqrt(Math.max(c[0], c[4])) : 0;
      web.current?.injectJavaScript(`fix(${m.latitude},${m.longitude},${m.status.status},${sigma || 0});true;`);
    });
    return () => sub.unsubscribe();
  }, [transport, status, topic]);

  useEffect(() => {
    if (status !== 'connected' || gotFix) { setShowEmpty(false); return; }
    const t = setTimeout(() => setShowEmpty(true), 3000);
    return () => clearTimeout(t);
  }, [status, gotFix]);

  return (
    <View style={[styles.container, { width: props.width || 300, height: props.height || 200 }]}>
      <WebView
        ref={web}
        key={tiles[0]}
        source={{ html: html(tiles) }}
        originWhitelist={['*']}
        style={styles.web}
        onLoadEnd={() => setGotFix(false)}
      />
      {showEmpty && !gotFix && (
        <View style={StyleSheet.absoluteFill}>
          <WidgetEmptyState widgetType="gps-map" topicName={topic} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: '#111' },
  web: { flex: 1, backgroundColor: '#111' },
});
