// Новосибирск bbox from Nominatim
const BBOX = {
  south: 54.8009,
  west: 82.7511,
  north: 55.1995,
  east: 83.1602
};
const CENTER = [54.99, 82.92];

const map = L.map('map').setView(CENTER, 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

let stations = [];
let markers = {};
let userReports = JSON.parse(localStorage.getItem('fuelReports') || '{}');

function saveReports() {
  localStorage.setItem('fuelReports', JSON.stringify(userReports));
}

function getReport(id) {
  return userReports[id] || { status: null, queue: null, price92: null, price95: null, diesel: null };
}

function setReport(id, data) {
  userReports[id] = { ...getReport(id), ...data };
  saveReports();
  renderAll();
  if (markers[id]) {
    markers[id].setPopupContent(createPopupContent(stations.find(s => s.id === id)));
  }
}

function getBestPrice(report) {
  const prices = [report.price92, report.price95, report.diesel].filter(p => p && !isNaN(p));
  return prices.length ? Math.min(...prices.map(Number)) : null;
}

function createPopupContent(station) {
  const report = getReport(station.id);
  const statusText = report.status === 'yes' ? '<span class="status-yes">✅ Есть топливо</span>' :
                     report.status === 'no' ? '<span class="status-no">❌ Нет топлива</span>' :
                     '<span class="status-unknown">❓ Неизвестно</span>';
  const queueText = report.queue === 'yes' ? '<span class="status-queue">⏳ Есть очередь</span>' :
                    report.queue === 'no' ? '<span class="status-yes">✅ Без очереди</span>' : '';

  const fuels = [];
  if (station.tags['fuel:octane_92'] || station.tags['fuel:octane_91']) fuels.push('АИ-92');
  if (station.tags['fuel:octane_95']) fuels.push('АИ-95');
  if (station.tags['fuel:diesel']) fuels.push('ДТ');
  if (station.tags['fuel:lpg']) fuels.push('Газ');

  return `
    <strong>${station.name}</strong><br>
    ${station.brand ? 'Бренд: ' + station.brand + '<br>' : ''}
    ${station.address ? station.address + '<br>' : ''}
    ${fuels.length ? 'Топливо: ' + fuels.join(', ') + '<br>' : ''}
    ${station.tags.opening_hours ? 'Часы: ' + station.tags.opening_hours + '<br>' : ''}
    <div style="margin-top:6px">${statusText} ${queueText}</div>
    <div class="popup-actions">
      <button onclick="setReport(${station.id}, {status: 'yes'})">Есть топливо</button>
      <button onclick="setReport(${station.id}, {status: 'no'})">Нет топлива</button>
      <button onclick="setReport(${station.id}, {queue: 'no'})">Без очереди</button>
      <button onclick="setReport(${station.id}, {queue: 'yes'})">Очередь</button>
      <button onclick="setReport(${station.id}, {status: null, queue: null})">Сброс</button>
    </div>
    <div style="margin-top:8px;font-size:0.85em">
      АИ-92: <input class="price-input" type="number" step="0.01" value="${report.price92 || ''}" onchange="setReport(${station.id}, {price92: this.value})" placeholder="₽"><br>
      АИ-95: <input class="price-input" type="number" step="0.01" value="${report.price95 || ''}" onchange="setReport(${station.id}, {price95: this.value})" placeholder="₽"><br>
      ДТ: <input class="price-input" type="number" step="0.01" value="${report.diesel || ''}" onchange="setReport(${station.id}, {diesel: this.value})" placeholder="₽">
    </div>
  `;
}

function renderStationCard(s, isRecommended = false) {
  const report = getReport(s.id);
  const statusClass = report.status === 'yes' ? 'status-yes' : report.status === 'no' ? 'status-no' : 'status-unknown';
  const statusText = report.status === 'yes' ? 'Есть топливо' : report.status === 'no' ? 'Нет топлива' : 'Нет данных';
  const queueText = report.queue === 'no' ? ' • Без очереди' : report.queue === 'yes' ? ' • Очередь' : '';
  const prices = [];
  if (report.price92) prices.push(`92: ${report.price92}₽`);
  if (report.price95) prices.push(`95: ${report.price95}₽`);
  if (report.diesel) prices.push(`ДТ: ${report.diesel}₽`);

  return `
    <div class="station-card ${isRecommended ? 'recommended' : ''}" onclick="focusStation(${s.id})">
      <h3>${s.name}</h3>
      <div class="meta">${s.brand || ''} ${s.address || ''}</div>
      <div class="status ${statusClass}">${statusText}${queueText}</div>
      ${prices.length ? `<div class="prices">${prices.join(' · ')}</div>` : ''}
    </div>
  `;
}

function renderAll() {
  const search = document.getElementById('search').value.toLowerCase();
  const onlyAvailable = document.getElementById('filter-available').checked;

  let filtered = stations.filter(s => {
    const report = getReport(s.id);
    const matchesSearch = !search || 
      s.name.toLowerCase().includes(search) || 
      (s.brand && s.brand.toLowerCase().includes(search)) ||
      (s.address && s.address.toLowerCase().includes(search));
    const hasFuel = report.status === 'yes';
    const noQueue = report.queue !== 'yes';
    const matchesAvail = !onlyAvailable || (hasFuel && noQueue);
    return matchesSearch && matchesAvail;
  });

  // Sort by best price (cheapest first), then by availability
  filtered.sort((a, b) => {
    const pa = getBestPrice(getReport(a.id));
    const pb = getBestPrice(getReport(b.id));
    if (pa && pb) return pa - pb;
    if (pa) return -1;
    if (pb) return 1;
    return 0;
  });

  // Recommended: top stations with fuel, no queue, and price
  const recommended = filtered.filter(s => {
    const r = getReport(s.id);
    return r.status === 'yes' && r.queue !== 'yes' && getBestPrice(r);
  }).slice(0, 5);

  document.getElementById('recommended-list').innerHTML = recommended.length
    ? recommended.map(s => renderStationCard(s, true)).join('')
    : '<p style="color:var(--text-muted);font-size:0.9rem">Пока нет данных. Отметьте цены и наличие на карте.</p>';

  document.getElementById('station-list').innerHTML = filtered.length
    ? filtered.map(s => renderStationCard(s)).join('')
    : '<p style="color:var(--text-muted)">Ничего не найдено</p>';
}

async function loadStations() {
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="fuel"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
      way["amenity"="fuel"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
    );
    out center tags;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query)
    });
    const data = await res.json();
    stations = data.elements.map(el => {
      const lat = el.lat || el.center?.lat;
      const lon = el.lon || el.center?.lon;
      const tags = el.tags || {};
      const name = tags.name || tags.brand || tags.operator || 'АЗС без названия';
      const brand = tags.brand || tags.operator || '';
      const addr = [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean).join(', ');
      return {
        id: el.id,
        lat,
        lon,
        name,
        brand,
        address: addr,
        tags
      };
    }).filter(s => s.lat && s.lon);

    stations.forEach(s => {
      const marker = L.marker([s.lat, s.lon]).addTo(map);
      marker.bindPopup(createPopupContent(s));
      markers[s.id] = marker;
    });

    renderAll();
  } catch (e) {
    console.error(e);
    document.getElementById('station-list').innerHTML = '<p>Ошибка загрузки данных с Overpass API. Попробуйте обновить страницу позже.</p>';
  }
}

function focusStation(id) {
  const station = stations.find(s => s.id === id);
  if (station && markers[id]) {
    map.setView([station.lat, station.lon], 16);
    markers[id].openPopup();
  }
}

document.getElementById('search').addEventListener('input', renderAll);
document.getElementById('filter-available').addEventListener('change', renderAll);

document.getElementById('locate').addEventListener('click', () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      map.setView([lat, lon], 14);
      L.circleMarker([lat, lon], { radius: 10, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.7, weight: 3 })
        .addTo(map)
        .bindPopup('<strong>Вы здесь</strong>')
        .openPopup();
    }, () => alert('Не удалось определить местоположение'));
  } else {
    alert('Геолокация не поддерживается');
  }
});

window.setReport = setReport;
window.focusStation = focusStation;

loadStations();