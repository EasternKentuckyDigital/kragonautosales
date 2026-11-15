const detailRoot = document.querySelector("#vehicleDetail");
const yearNode = document.querySelector("#year");
const params = new URLSearchParams(window.location.search);
const vehicleId = params.get("id");

let business = {};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
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
    detailRoot.setAttribute("aria-busy", "false");
    detailRoot.innerHTML =
      '<p class="empty-state">Vehicle details are temporarily unavailable. <a href="tel:+16065685622">Call Ronnie for help →</a></p>';
  });

function hydrateBusiness() {
  setText("[data-business-phone]", business.phoneDisplay);
  document.querySelectorAll("[data-business-phone-link]").forEach((node) => {
    if (business.phone) node.href = `tel:${business.phone}`;
  });
  document.querySelectorAll("[data-business-email-link]").forEach((node) => {
    if (business.email) node.href = `mailto:${business.email}`;
  });
  setText("[data-business-name]", business.name);
  setText("[data-business-tagline]", business.tagline);
}

function renderDetail(vehicle) {
  detailRoot.setAttribute("aria-busy", "false");
  if (!vehicle) {
    detailRoot.innerHTML = `
      <div class="detail-empty">
        <p class="eyebrow">Vehicle not found</p>
        <h1>That listing is unavailable.</h1>
        <a class="text-link" href="index.html#inventory"><span aria-hidden="true">←</span> Back to inventory</a>
      </div>
    `;
    return;
  }

  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
  const photos = Array.isArray(vehicle.photos) ? vehicle.photos : [];
  const highlights = Array.isArray(vehicle.highlights)
    ? vehicle.highlights
    : [];
  const rebuilt =
    /rebuilt\s+title/i.test(vehicle.description || "") ||
    highlights.some((item) => /rebuilt\s+title/i.test(item));
  const inquiry = `mailto:${business.email || "gross.ronnie@gmail.com"}?subject=${encodeURIComponent(`Interested in the ${title}`)}&body=${encodeURIComponent(`Hi Ronnie, I'm interested in the ${title}. Is it still available?\n\n${window.location.href}`)}`;
  document.title = `${title} | Kragon Auto Sales LLC`;

  detailRoot.innerHTML = `
    <a class="text-link" href="index.html#inventory"><span aria-hidden="true">←</span> Back to inventory</a>
    <section class="vehicle-detail">
      <div class="detail-gallery">
        <div class="detail-main-photo">
          ${photos.length ? `<img id="mainVehiclePhoto" src="${escapeHtml(photos[0])}" alt="${escapeHtml(title)} photo 1" width="900" height="675">` : '<div class="photo-fallback">Photos coming soon</div>'}
          ${photos.length > 1 ? '<button class="gallery-arrow gallery-prev" type="button" aria-label="Previous photo">‹</button><button class="gallery-arrow gallery-next" type="button" aria-label="Next photo">›</button>' : ""}
        </div>

      </div>

      <article class="detail-info">
        <p class="eyebrow">${vehicle.status === "sold" ? "Sold — no longer available" : "Available now"}</p>
        <h1>${escapeHtml(title)}</h1>
        ${rebuilt ? '<p class="vehicle-disclosure">Rebuilt title</p>' : ""}
        <p class="detail-price">${vehicle.price ? money.format(vehicle.price) : "Call for price"}</p>
        <ul class="detail-specs">
          ${vehicle.mileage ? `<li><strong>Mileage</strong><span>${number.format(vehicle.mileage)} miles</span></li>` : ""}
          ${vehicle.engine ? `<li><strong>Engine</strong><span>${escapeHtml(vehicle.engine)}</span></li>` : ""}
          ${vehicle.transmission ? `<li><strong>Transmission</strong><span>${escapeHtml(vehicle.transmission)}</span></li>` : ""}
          ${vehicle.drivetrain ? `<li><strong>Drivetrain</strong><span>${escapeHtml(vehicle.drivetrain)}</span></li>` : ""}
        </ul>
        ${vehicle.description ? `<h2 class="description-heading">About this vehicle</h2><p class="detail-description">${escapeHtml(vehicle.description)}</p>` : ""}
        ${highlights.length ? `<ul class="vehicle-highlights detail-highlights">${highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        <div class="detail-contact">
          <a class="button" href="tel:${escapeHtml(business.phone || "+16065685622")}">Call Ronnie · ${escapeHtml(business.phoneDisplay || "(606) 568-5622")}</a>
          <a class="button button-secondary" href="${escapeHtml(inquiry)}">Email Ronnie</a>
        </div>
      </article>
    </section>
  `;

  let photoIndex = 0;
  function showPhoto(index) {
    if (!photos.length) return;
    photoIndex = (index + photos.length) % photos.length;
    const mainPhoto = detailRoot.querySelector("#mainVehiclePhoto");
    mainPhoto.src = photos[photoIndex];
    mainPhoto.alt = `${title} photo ${photoIndex + 1}`;
  }
  const gallery = detailRoot.querySelector(".detail-main-photo");
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
        showPhoto(photoIndex + (deltaX < 0 ? 1 : -1));
    },
    { passive: true },
  );
  detailRoot
    .querySelector(".gallery-prev")
    ?.addEventListener("click", () => showPhoto(photoIndex - 1));
  detailRoot
    .querySelector(".gallery-next")
    ?.addEventListener("click", () => showPhoto(photoIndex + 1));
  detailRoot
    .querySelector(".detail-gallery")
    .addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        showPhoto(photoIndex + (event.key === "ArrowLeft" ? -1 : 1));
      }
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
