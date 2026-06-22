const detailRoot = document.querySelector("#vehicleDetail");
const yearNode = document.querySelector("#year");
const params = new URLSearchParams(window.location.search);
const vehicleId = params.get("id");

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
    hydrateBusiness();
    const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    renderDetail(vehicle);
  })
  .catch(() => {
    detailRoot.innerHTML = '<p class="empty-state">Vehicle details are temporarily unavailable.</p>';
  });

function hydrateBusiness() {
  setText("[data-business-name]", business.name);
  setText("[data-business-tagline]", business.tagline);
}

function renderDetail(vehicle) {
  if (!vehicle) {
    detailRoot.innerHTML = `
      <div class="detail-empty">
        <p class="eyebrow">Vehicle not found</p>
        <h1>That listing is unavailable.</h1>
        <a class="text-link" href="index.html#inventory">Back to inventory</a>
      </div>
    `;
    return;
  }

  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  const photos = Array.isArray(vehicle.photos) ? vehicle.photos : [];
  const highlights = Array.isArray(vehicle.highlights) ? vehicle.highlights : [];
  document.title = `${title} | Kragon Auto Sales LLC`;

  detailRoot.innerHTML = `
    <a class="text-link" href="index.html#inventory">Back to inventory</a>
    <section class="vehicle-detail">
      <div class="detail-gallery">
        <div class="detail-main-photo">
          ${photos.length ? `<img id="mainVehiclePhoto" src="${escapeHtml(photos[0])}" alt="${escapeHtml(title)}">` : '<div class="photo-fallback">Photos coming soon</div>'}
        </div>
        ${photos.length > 1 ? `<div class="thumb-grid">${photos.map((photo, index) => `
          <button class="thumb-button${index === 0 ? " is-active" : ""}" type="button" data-photo="${escapeHtml(photo)}">
            <img src="${escapeHtml(photo)}" alt="${escapeHtml(title)} photo ${index + 1}">
          </button>
        `).join("")}</div>` : ""}
      </div>

      <article class="detail-info">
        <p class="eyebrow">Available now</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="detail-price">${vehicle.price ? money.format(vehicle.price) : "Call for price"}</p>
        <ul class="detail-specs">
          ${vehicle.mileage ? `<li><strong>Mileage</strong><span>${number.format(vehicle.mileage)} miles</span></li>` : ""}
          ${vehicle.engine ? `<li><strong>Engine</strong><span>${escapeHtml(vehicle.engine)}</span></li>` : ""}
          ${vehicle.transmission ? `<li><strong>Transmission</strong><span>${escapeHtml(vehicle.transmission)}</span></li>` : ""}
          ${vehicle.drivetrain ? `<li><strong>Drivetrain</strong><span>${escapeHtml(vehicle.drivetrain)}</span></li>` : ""}
        </ul>
        ${vehicle.description ? `<p class="detail-description">${escapeHtml(vehicle.description)}</p>` : ""}
        ${highlights.length ? `<ul class="vehicle-highlights detail-highlights">${highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        <div class="detail-contact">
          <span>Call Ronnie</span>
          <a data-business-phone-link href="${business.phone ? `tel:${business.phone}` : "#"}">${escapeHtml(business.phoneDisplay || "(606) 568-5622")}</a>
        </div>
      </article>
    </section>
  `;

  detailRoot.querySelectorAll(".thumb-button").forEach((button) => {
    button.addEventListener("click", () => {
      const mainPhoto = detailRoot.querySelector("#mainVehiclePhoto");
      if (!mainPhoto) return;
      mainPhoto.src = button.dataset.photo;
      detailRoot.querySelectorAll(".thumb-button").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
    });
  });
}

function setText(selector, value) {
  if (!value) return;
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value;
  });
}

function escapeHtml(input = "") {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
