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
  return userReports[id] || { status: null, price92: null, price95: null, diesel: null };
}

function setReport(id, data) {
  userReports[id] = { ...getReport(id), ...data };
  saveReports();
  renderList();
  // Update marker popup if open
  if (markers[id]) {
    markers[id].setPopupContent(createPopupContent(stations.find(s => s.id === id)));
  }
}

function createPopupContent(station) {
  const report = getReport(station.id);
  const statusText = report.status === 'yes' ? '<span class="status-yes">✅ Есть топливо</span>' :
                     report.status === 'no' ? '<span class="status-no">❌ Нет топлива</span>' :
                     '<span class="status-unknown">❓ Неизвестно</span>';

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
    <div style="margin-top:6px">${statusText}</div>
    <div class="popup-actions">
      <button onclick="setReport(${station.id}, {status: 'yes'})">Есть</button>
      <button onclick="setReport(${station.id}, {status: 'no'})">Нет</button>
      <button onclick="setReport(${station.id}, {status: null})">Сброс</button>
    </div>
    <div style="margin-top:8px;font-size:0.85em">
      АИ-92: <input class="price-input" type="number" step="0.01" value="${report.price92 || ''}" onchange="setReport(${station.id}, {price92: this.value})" placeholder="₽"><br>
      АИ-95: <input class="price-input" type="number" step="0.01" value="${report.price95 || ''}" onchange="setReport(${station.id}, {price95: this.value})" placeholder="₽"><br>
      ДТ: <input class="price-input" type="number" step="0.01" value="${report.diesel || ''}" onchange="setReport(${station.id}, {diesel: this.value})" placeholder="₽">
    </div>
  `;
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

    renderList();
  } catch (e) {
    console.error(e);
    document.getElementById('station-list').innerHTML = '<p>Ошибка загрузки данных с Overpass API. Попробуйте обновить страницу позже.</p>';
  }
}

function renderList() {
  const search = document.getElementById('search').value.toLowerCase();
  const onlyAvailable = document.getElementById('filter-available').checked;

  const filtered = stations.filter(s => {
    const report = getReport(s.id);
    const matchesSearch = !search || 
      s.name.toLowerCase().includes(search) || 
      (s.brand && s.brand.toLowerCase().includes(search)) ||
      (s.address && s.address.toLowerCase().includes(search));
    const matchesAvail = !onlyAvailable || report.status === 'yes';
    return matchesSearch && matchesAvail;
  });

  const listEl = document.getElementById('station-list');
  listEl.innerHTML = filtered.map(s => {
    const report = getReport(s.id);
    const statusClass = report.status === 'yes' ? 'status-yes' : report.status === 'no' ? 'status-no' : 'status-unknown';
    const statusText = report.status === 'yes' ? 'Есть топливо' : report.status === 'no' ? 'Нет топлива' : 'Нет данных';
    const prices = [];
    if (report.price92) prices.push(`92: ${report.price92}₽`);
    if (report.price95) prices.push(`95: ${report.price95}₽`);
    if (report.diesel) prices.push(`ДТ: ${report.diesel}₽`);

    return `
      <div class="station-item" onclick="focusStation(${s.id})">
        <h3>${s.name}</h3>
        <p>${s.brand || ''} ${s.address || ''}</p>
        <p class="${statusClass}">${statusText}</p>
        ${prices.length ? `<p>${prices.join(' · ')}</p>` : ''}
      </div>
    `;
  }).join('') || '<p>Ничего не найдено</p>';
}

function focusStation(id) {
  const station = stations.find(s => s.id === id);
  if (station && markers[id]) {
    map.setView([station.lat, station.lon], 16);
    markers[id].openPopup();
  }
}

document.getElementById('search').addEventListener('input', renderList);
document.getElementById('filter-available').addEventListener('change', renderList);

document.getElementById('locate').addEventListener('click', () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      map.setView([lat, lon], 14);
      L.circleMarker([lat, lon], { radius: 8, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.6 })
        .addTo(map)
        .bindPopup('Вы здесь')
        .openPopup();
    }, () => alert('Не удалось определить местоположение'));
  } else {
    alert('Геолокация не поддерживается');
  }
});

// Make functions global for popup buttons
window.setReport = setReport;
window.focusStation = focusStation;

loadStations();