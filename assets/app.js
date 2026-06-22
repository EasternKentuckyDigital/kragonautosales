const inventoryGrid = document.querySelector("#inventoryGrid");
const emptyState = document.querySelector("#emptyState");
const yearNode = document.querySelector("#year");

let inventory = [];
let business = {};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const number = new Intl.NumberFormat("en-US");

yearNode.textContent = new Date().getFullYear();

fetch("data/inventory.json", { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error("Inventory could not be loaded.");
    return response.json();
  })
  .then((data) => {
    business = data.business || {};
    inventory = Array.isArray(data.vehicles) ? data.vehicles : [];
    hydrateBusiness();
    renderInventory();
  })
  .catch(() => {
    inventoryGrid.innerHTML = '<p class="empty-state">Inventory is temporarily unavailable. Please call for current vehicles.</p>';
  });

function hydrateBusiness() {
  setText("[data-business-name]", business.name);
  setText("[data-business-tagline]", business.tagline);
  setText("[data-business-phone]", business.phoneDisplay);
  setText("[data-business-email]", business.email);
  setText("[data-business-address]", business.address);
  setText("[data-business-hours]", business.hours);

  document.querySelectorAll("[data-business-phone-link]").forEach((node) => {
    if (business.phone) node.href = `tel:${business.phone}`;
  });

  document.querySelectorAll("[data-business-email-link]").forEach((node) => {
    if (business.email) node.href = `mailto:${business.email}`;
  });

  document.querySelectorAll("[data-inventory-count]").forEach((node) => {
    node.textContent = inventory.filter((vehicle) => vehicle.status !== "sold").length;
  });
}

function setText(selector, value) {
  if (!value) return;
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value;
  });
}

function renderInventory() {
  const vehicles = inventory
    .filter((vehicle) => vehicle.status !== "sold")
    .sort(sortVehicles());

  inventoryGrid.innerHTML = vehicles.map(vehicleCard).join("");
  emptyState.hidden = vehicles.length > 0;
}

function sortVehicles() {
  return (a, b) => {
    const featured = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    if (featured) return featured;
    return value(b.year) - value(a.year);
  };
}

function vehicleCard(vehicle) {
  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  const photo = Array.isArray(vehicle.photos) && vehicle.photos.length ? vehicle.photos[0] : "";
  const highlights = Array.isArray(vehicle.highlights) ? vehicle.highlights : [];

  return `
    <a class="vehicle-card-link" href="vehicle.html?id=${encodeURIComponent(vehicle.id)}" aria-label="View ${escapeHtml(title)} details">
      <article class="vehicle-card">
      <div class="vehicle-photo">
        ${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(title)}">` : '<div class="photo-fallback">Photo coming soon</div>'}
      </div>
      <div class="vehicle-body">
        <div class="vehicle-title">
          <h3>${escapeHtml(title)}</h3>
          <span class="price">${vehicle.price ? money.format(vehicle.price) : "Call"}</span>
        </div>
        <ul class="vehicle-meta">
          ${vehicle.mileage ? `<li>${number.format(vehicle.mileage)} miles</li>` : ""}
          ${vehicle.engine ? `<li>${escapeHtml(vehicle.engine)}</li>` : ""}
          ${vehicle.exterior ? `<li>${escapeHtml(vehicle.exterior)}</li>` : ""}
          ${vehicle.transmission ? `<li>${escapeHtml(vehicle.transmission)}</li>` : ""}
          ${vehicle.drivetrain ? `<li>${escapeHtml(vehicle.drivetrain)}</li>` : ""}
        </ul>
        ${vehicle.description ? `<p class="vehicle-description">${escapeHtml(vehicle.description)}</p>` : ""}
        ${highlights.length ? `<ul class="vehicle-highlights">${highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      </div>
      </article>
    </a>
  `;
}

function value(input) {
  return Number(input) || 0;
}

function escapeHtml(input = "") {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
