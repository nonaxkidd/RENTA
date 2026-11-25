const BASE = "http://127.0.0.1:5000/api/v1";
const stamp = Date.now().toString().slice(-6);
const moveIn = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString();

async function api(method, route, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text.slice(0, 180); }
  return { status: res.status, json };
}

async function login(email, password) {
  const result = await api("POST", "/auth/login", { body: { email, password } });
  return result.json.token;
}

const owner = await login("owner@gmail.com", "Owner12345!");
const tenant = await login("tenant@gmail.com", "Tenant12345!");
const admin = await login("admin@renta.local", "Admin12345!");

const created = await api("POST", "/listings", {
  token: owner,
  body: {
    title: `Paid remove ${stamp}`, type: "Private room", barangay: "Ilaya", price: 3300,
    description: "Paid reservation remove probe.", capacity: 2, ownerName: "Maria Santos",
    imageUrl: "https://example.com/renta-photo.jpg", lat: 13.36, lng: 121.18,
  },
});
const id = created.json.listing._id;
await api("PATCH", `/admin/listings/${id}/review`, { token: admin, body: { decision: "approve" } });
const reserved = await api("POST", `/reservations/listings/${id}`, {
  token: tenant,
  body: { intendedMoveIn: moveIn, occupants: 1 },
});
const reservationId = reserved.json.reservation._id;
await api("PATCH", `/reservations/${reservationId}/decision`, { token: owner, body: { decision: "approve" } });
const checkout = await api("POST", "/payments/checkout", { token: tenant, body: { reservationId } });
const paymentId = checkout.json.checkoutUrl.split("/").pop();
await api("POST", `/payments/mock/${paymentId}/pay`, { token: tenant });
const removed = await api("DELETE", `/listings/${id}`, { token: owner });
const mine = await api("GET", "/listings/mine", { token: owner });
const stored = mine.json.listings.find((item) => item._id === id);
const reservations = await api("GET", "/reservations/mine", { token: tenant });
const reservation = reservations.json.reservations.find((item) => item._id === reservationId);
const payment = await api("GET", `/payments/mock/${paymentId}`, { token: tenant });
const notes = await api("GET", "/notifications", { token: tenant });
const note = notes.json.notifications.find((item) => String(item.body).includes(stamp));

console.log(JSON.stringify({
  deleteStatus: removed.status,
  deleteMessage: removed.json?.message ?? null,
  stillOnOwnerList: Boolean(stored),
  archivedAt: stored?.archivedAt ?? null,
  reservationStatus: reservation?.queueStatus ?? null,
  paymentStatus: payment.json?.payment?.status ?? null,
  tenantNote: note ? { title: note.title, body: note.body } : null,
}, null, 2));
