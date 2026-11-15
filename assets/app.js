const inventoryGrid = document.querySelector("#inventoryGrid");
const emptyState = document.querySelector("#emptyState");
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("en-US");
document.querySelector("#year").textContent = new Date().getFullYear();

fetch("data/inventory.json", { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error("Inventory unavailable");
    return response.json();
  })
  .then((data) => {
    const business = data.business || {};
    const vehicles = (Array.isArray(data.vehicles) ? data.vehicles : [])
      .filter((vehicle) => vehicle.status !== "sold")
      .sort(
        (a, b) =>
          Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
          Number(b.year) - Number(a.year),
      );
    for (const [key, value] of Object.entries({
      name: business.name,
      phone: business.phoneDisplay,
    })) {
      if (value)
        document.querySelectorAll(`[data-business-${key}]`).forEach((node) => {
          node.textContent = value;
        });
    }
    document.querySelectorAll("[data-business-phone-link]").forEach((node) => {
      if (business.phone) node.href = `tel:${business.phone}`;
    });
    document.querySelectorAll("[data-business-email-link]").forEach((node) => {
      if (business.email) node.href = `mailto:${business.email}`;
    });
    inventoryGrid.innerHTML = vehicles
      .map((vehicle, index) => vehicleCard(vehicle, index, business))
      .join("");
    document.querySelector("#inventoryTotal").textContent =
      `${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"}`;
    inventoryGrid.setAttribute("aria-busy", "false");
    emptyState.hidden = vehicles.length > 0;
    inventoryGrid
      .querySelectorAll(".vehicle-card")
      .forEach((card, index) => setupGallery(card, vehicles[index]));
  })
  .catch(() => {
    inventoryGrid.setAttribute("aria-busy", "false");
    document.querySelector("#inventoryTotal").textContent = "";
    inventoryGrid.innerHTML =
      '<p class="empty-state">Inventory is temporarily unavailable. <a href="tel:+16065685622">Call Ronnie</a> or <a href="mailto:gross.ronnie@gmail.com">email</a>.</p>';
  });

function vehicleCard(vehicle, index, business) {
  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
  const photos = Array.isArray(vehicle.photos) ? vehicle.photos : [];
  const description = [
    vehicle.description || "",
    ...(vehicle.highlights || []),
  ].join(" ");
  const titleStatus = /rebuilt\s+title/i.test(description)
    ? "Rebuilt title"
    : /clean\s+title/i.test(description)
      ? "Clean title"
      : "";
  const detailsUrl = `vehicle.html?id=${encodeURIComponent(vehicle.id)}`;
  const inquiry = `mailto:${business.email || "gross.ronnie@gmail.com"}?subject=${encodeURIComponent(`Interested in the ${title}`)}`;
  return `<article class="vehicle-card" aria-label="${escapeHtml(title)}">
    <div class="vehicle-photo" role="group" aria-label="${escapeHtml(title)} photos">
      ${photos.length ? `<img src="${escapeHtml(photos[0])}" alt="${escapeHtml(title)} photo 1" loading="${index < 3 ? "eager" : "lazy"}" decoding="async" width="640" height="480">` : '<div class="photo-fallback">Photos coming soon</div>'}
      ${photos.length > 1 ? '<button class="gallery-arrow gallery-prev" type="button" aria-label="Previous photo">‹</button><button class="gallery-arrow gallery-next" type="button" aria-label="Next photo">›</button>' : ""}
    </div>
    <div class="vehicle-body">
      <h2><a href="${detailsUrl}">${escapeHtml(title)}</a></h2>
      <dl class="vehicle-specs">
        ${vehicle.mileage != null ? `<div><dt>Mileage</dt><dd>${number.format(vehicle.mileage)} mi</dd></div>` : ""}
        ${vehicle.transmission ? `<div><dt>Transmission</dt><dd>${escapeHtml(vehicle.transmission)}</dd></div>` : ""}
        ${vehicle.engine ? `<div><dt>Engine</dt><dd>${escapeHtml(vehicle.engine)}</dd></div>` : ""}
        ${titleStatus ? `<div><dt>Title</dt><dd class="${titleStatus === "Rebuilt title" ? "title-disclosure" : ""}">${titleStatus}</dd></div>` : ""}
      </dl>
    </div>
    <div class="vehicle-actions"><div class="vehicle-price"><span>Asking price</span><strong>${vehicle.price ? money.format(vehicle.price) : "Call for price"}</strong></div>
      <a class="button" href="${detailsUrl}">View details <span aria-hidden="true">→</span></a>
      <div class="vehicle-contact"><a href="tel:${escapeHtml(business.phone || "+16065685622")}">Call Ronnie</a><span aria-hidden="true">|</span><a href="${escapeHtml(inquiry)}">Email</a></div>
    </div>
  </article>`;
}

function setupGallery(card, vehicle) {
  const photos = Array.isArray(vehicle.photos) ? vehicle.photos : [];
  if (photos.length < 2) return;
  const gallery = card.querySelector(".vehicle-photo");
  const image = gallery.querySelector("img");
  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
  let index = 0;
  function showPhoto(direction) {
    index = (index + direction + photos.length) % photos.length;
    image.src = photos[index];
    image.alt = `${title} photo ${index + 1}`;
  }
  gallery
    .querySelector(".gallery-prev")
    .addEventListener("click", () => showPhoto(-1));
  gallery
    .querySelector(".gallery-next")
    .addEventListener("click", () => showPhoto(1));
  gallery.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      showPhoto(event.key === "ArrowRight" ? 1 : -1);
    }
  });
  let startX = 0;
  let startY = 0;
  gallery.addEventListener(
    "touchstart",
    (event) => {
      startX = event.changedTouches[0].clientX;
      startY = event.changedTouches[0].clientY;
    },
    { passive: true },
  );
  gallery.addEventListener(
    "touchend",
    (event) => {
      const deltaX = event.changedTouches[0].clientX - startX;
      const deltaY = event.changedTouches[0].clientY - startY;
      if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY))
        showPhoto(deltaX < 0 ? 1 : -1);
    },
    { passive: true },
  );
}

function escapeHtml(input = "") {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
