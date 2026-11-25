import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const BASE = "http://127.0.0.1:5000/api/v1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stamp = Date.now().toString().slice(-6);
const pass = "Verify12345!";
const moveIn = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

async function api(method, route, { token, body, base = BASE } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = text.slice(0, 180); }
  return { status: res.status, json };
}

async function login(email, password) {
  const result = await api("POST", "/auth/login", { body: { email, password } });
  return { status: result.status, token: result.json?.token, body: result.json };
}

function pick(listing) {
  if (!listing) return null;
  return {
    verified: listing.verified,
    available: listing.available,
    ownerId: String(listing.ownerId),
    ownerName: listing.ownerName,
    archivedAt: listing.archivedAt ?? null,
    reviewNote: listing.reviewNote ?? null,
    price: listing.price,
    title: listing.title,
  };
}

const owner = await login("owner@gmail.com", "Owner12345!");
const tenant = await login("tenant@gmail.com", "Tenant12345!");
const admin = await login("admin@renta.local", "Admin12345!");
const superadmin = await login("superadmin@renta.local", "SuperAdmin12345!");

const createdB = await api("POST", "/admin/users", {
  token: superadmin.token,
  body: {
    firstName: "Owner", lastName: "Bee", email: `renta.g.b.${stamp}@gmail.com`, phone: "09170002001",
    role: "owner", password: pass, adminPassword: "SuperAdmin12345!",
  },
});
const users = await api("GET", "/admin/users", { token: superadmin.token });
const ownerBUser = users.json.users.find((item) => item.email === `renta.g.b.${stamp}@gmail.com`);
const ownerB = await login(ownerBUser.email, pass);

const listingRes = await api("POST", "/listings", {
  token: owner.token,
  body: {
    title: `Guard ${stamp}`, type: "Private room", barangay: "Ilaya", price: 2500,
    description: "Field guard.", capacity: 2, ownerName: "Maria Santos",
    imageUrl: "https://example.com/renta-photo.jpg", lat: 13.36, lng: 121.18,
  },
});
const id = listingRes.json.listing._id;
await api("PATCH", `/admin/listings/${id}/review`, { token: admin.token, body: { decision: "approve" } });
const before = await api("GET", `/listings/${id}`);
const tamper = await api("PUT", `/listings/${id}`, {
  token: owner.token,
  body: {
    verified: true,
    available: false,
    ownerId: ownerBUser._id,
    ownerName: "Stolen Name",
    archivedAt: new Date().toISOString(),
    reviewNote: "should not stick",
  },
});
const mine = await api("GET", "/listings/mine", { token: owner.token });
const stored = mine.json.listings.find((item) => item._id === id);

const putB = await api("PUT", `/listings/${id}`, { token: ownerB.token, body: { title: "hijack" } });
const delB = await api("DELETE", `/listings/${id}`, { token: ownerB.token });
const putT = await api("PUT", `/listings/${id}`, { token: tenant.token, body: { title: "hijack" } });
const delT = await api("DELETE", `/listings/${id}`, { token: tenant.token });

const hidden = await api("POST", "/listings", {
  token: owner.token,
  body: {
    title: `Hidden ${stamp}`, type: "Studio unit", barangay: "Balite", price: 1800,
    description: "Not approved.", capacity: 1, ownerName: "Maria Santos",
    imageUrl: "https://example.com/renta-photo.jpg", lat: 13.37, lng: 121.19,
  },
});
const hiddenId = hidden.json.listing._id;
const publicList = await api("GET", "/listings?limit=50");
const publicOne = await api("GET", `/listings/${hiddenId}`);
const pendingOwner = await api("POST", "/admin/users", {
  token: superadmin.token,
  body: {
    firstName: "Pending", lastName: "Owner", email: `renta.g.pending.${stamp}@gmail.com`, phone: "09170002002",
    role: "owner", password: pass, adminPassword: "SuperAdmin12345!",
  },
});
const pendingLogin = await login(`renta.g.pending.${stamp}@gmail.com`, pass);
const pendingListing = await api("POST", "/listings", {
  token: pendingLogin.token,
  body: {
    title: `Pending owner ${stamp}`, type: "Bedspace", barangay: "Balingayan", price: 900,
    description: "Pending owner listing.", capacity: 1, ownerName: "Pending Owner",
    imageUrl: "https://example.com/renta-photo.jpg", lat: 13.38, lng: 121.2,
  },
});
const pendingId = pendingListing.json?.listing?._id;
if (pendingId) {
  await api("PATCH", `/admin/listings/${pendingId}/review`, { token: admin.token, body: { decision: "approve" } });
}
const publicPending = pendingId ? await api("GET", `/listings/${pendingId}`) : pendingListing;
const reserveHidden = await api("POST", `/reservations/listings/${hiddenId}`, {
  token: tenant.token,
  body: { intendedMoveIn: moveIn, occupants: 1 },
});

const priced = await api("POST", "/listings", {
  token: owner.token,
  body: {
    title: `Price ${stamp}`, type: "1BR unit", barangay: "Gutad", price: 4000,
    description: "Price snapshot.", capacity: 3, ownerName: "Maria Santos",
    imageUrl: "https://example.com/renta-photo.jpg", lat: 13.39, lng: 121.17,
  },
});
const priceId = priced.json.listing._id;
await api("PATCH", `/admin/listings/${priceId}/review`, { token: admin.token, body: { decision: "approve" } });
const reserved = await api("POST", `/reservations/listings/${priceId}`, {
  token: tenant.token,
  body: { intendedMoveIn: moveIn, occupants: 1 },
});
const reservationId = reserved.json?.reservation?._id;
const approved = await api("PATCH", `/reservations/${reservationId}/decision`, {
  token: owner.token,
  body: { decision: "approve" },
});
await api("PUT", `/listings/${priceId}`, { token: owner.token, body: { price: 9999 } });
const checkout = await api("POST", "/payments/checkout", { token: tenant.token, body: { reservationId } });

const removable = await api("POST", "/listings", {
  token: owner.token,
  body: {
    title: `Remove ${stamp}`, type: "2BR unit", barangay: "Lazareto", price: 5200,
    description: "Will be removed.", capacity: 4, ownerName: "Maria Santos",
    imageUrl: "https://example.com/renta-photo.jpg", lat: 13.35, lng: 121.16,
  },
});
const removeId = removable.json.listing._id;
await api("PATCH", `/admin/listings/${removeId}/review`, { token: admin.token, body: { decision: "approve" } });
const queued = await api("POST", `/reservations/listings/${removeId}`, {
  token: tenant.token,
  body: { intendedMoveIn: moveIn, occupants: 1 },
});
const queuedId = queued.json?.reservation?._id;
const queuedDecision = await api("PATCH", `/reservations/${queuedId}/decision`, {
  token: owner.token,
  body: { decision: "approve" },
});
const queuedCheckout = await api("POST", "/payments/checkout", { token: tenant.token, body: { reservationId: queuedId } });
const queuedPaymentId = queuedCheckout.json?.checkoutUrl?.split("/").pop();
await api("DELETE", `/listings/${removeId}`, { token: owner.token });
const afterRemove = await api("GET", "/reservations/mine", { token: tenant.token });
const removedReservation = afterRemove.json?.reservations?.find((item) => item._id === queuedId);
const removedPayment = queuedPaymentId
  ? await api("GET", `/payments/mock/${queuedPaymentId}`, { token: tenant.token })
  : null;
const notes = await api("GET", "/notifications", { token: tenant.token });
const removalNote = notes.json?.notifications?.find((item) => String(item.body || "").includes("was removed"));

const tenantUser = users.json.users.find((item) => item.email === "tenant@gmail.com");
const adminUser = users.json.users.find((item) => item.email === "admin@renta.local");
const createAdmin = await api("POST", "/admin/users", {
  token: admin.token,
  body: {
    firstName: "Nope", lastName: "Admin", email: `renta.g.admin.${stamp}@renta.local`, phone: "09170002003",
    role: "admin", password: pass, adminPassword: "Admin12345!",
  },
});
const roleTenant = await api("PATCH", `/admin/users/${tenantUser._id}`, {
  token: admin.token,
  body: { firstName: tenantUser.firstName, lastName: tenantUser.lastName, email: tenantUser.email, phone: "09181234567", role: "admin" },
});
const roleSelf = await api("PATCH", `/admin/users/${adminUser._id}`, {
  token: admin.token,
  body: { firstName: adminUser.firstName, lastName: adminUser.lastName, email: adminUser.email, phone: "09170002009", role: "superadmin" },
});

const onceListing = await api("POST", "/listings", {
  token: owner.token,
  body: {
    title: `Once ${stamp}`, type: "Private room", barangay: "Ilaya", price: 2100,
    description: "Pay once.", capacity: 2, ownerName: "Maria Santos",
    imageUrl: "https://example.com/renta-photo.jpg", lat: 13.36, lng: 121.18,
  },
});
const onceId = onceListing.json.listing._id;
await api("PATCH", `/admin/listings/${onceId}/review`, { token: admin.token, body: { decision: "approve" } });
const onceReserve = await api("POST", `/reservations/listings/${onceId}`, {
  token: tenant.token,
  body: { intendedMoveIn: moveIn, occupants: 1 },
});
await api("PATCH", `/reservations/${onceReserve.json.reservation._id}/decision`, { token: owner.token, body: { decision: "approve" } });
const onceCheckout = await api("POST", "/payments/checkout", { token: tenant.token, body: { reservationId: onceReserve.json.reservation._id } });
const paymentId = onceCheckout.json?.checkoutUrl?.split("/").pop();
const firstPay = await api("POST", `/payments/mock/${paymentId}/pay`, { token: tenant.token });
const secondPay = await api("POST", `/payments/mock/${paymentId}/pay`, { token: tenant.token });

const child = spawn("npx", ["tsx", "src/server.ts"], {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: "development", PAYMONGO_MOCK: "false", OTP_LOG_CODE: "false", PORT: "5098" },
  shell: true,
  windowsHide: true,
});
let boot = "";
child.stdout.on("data", (chunk) => { boot += chunk.toString(); });
child.stderr.on("data", (chunk) => { boot += chunk.toString(); });
const ready = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(false), 20000);
  const poll = setInterval(() => {
    if (boot.includes("RENTA server running") || boot.includes("Refusing to start")) {
      clearInterval(poll);
      clearTimeout(timer);
      resolve(boot.includes("RENTA server running"));
    }
  }, 200);
});
const mockOff = ready
  ? await api("GET", `/payments/mock/${paymentId}`, { token: tenant.token, base: "http://127.0.0.1:5098/api/v1" })
  : { status: 0, json: boot.slice(0, 300) };
child.kill();
setTimeout(() => process.exit(0), 300);

console.log(JSON.stringify({
  logins: { owner: owner.status, tenant: tenant.status, admin: admin.status, superadmin: superadmin.status, ownerB: ownerB.status, createdB: createdB.status },
  a: {
    before: pick(before.json?.listing),
    putStatus: tamper.status,
    stored: pick(stored),
    ownerBPut: { status: putB.status, message: putB.json?.message },
    ownerBDelete: { status: delB.status, message: delB.json?.message },
    tenantPut: { status: putT.status, message: putT.json?.message },
    tenantDelete: { status: delT.status, message: delT.json?.message },
  },
  b: {
    unverifiedInList: publicList.json?.listings?.some((item) => item._id === hiddenId) ?? null,
    unverifiedGet: { status: publicOne.status, title: publicOne.json?.listing?.title ?? null },
    pendingOwnerCreate: pendingOwner.status,
    pendingOwnerGet: { status: publicPending.status, title: publicPending.json?.listing?.title ?? publicPending.json?.message },
    reserveUnverified: { status: reserveHidden.status, message: reserveHidden.json?.message },
  },
  c: {
    approved: approved.status,
    snap: approved.json?.reservation?.downPaymentAmount ?? null,
    checkout: { status: checkout.status, amount: checkout.json?.amount, message: checkout.json?.message },
  },
  d: {
    queued: queued.status,
    approved: queuedDecision.status,
    checkout: queuedCheckout.status,
    reservationStatus: removedReservation?.queueStatus ?? null,
    isActive: removedReservation?.isActive ?? null,
    paymentStatus: removedPayment?.json?.payment?.status ?? removedPayment?.json?.message ?? null,
    note: removalNote ? { title: removalNote.title, body: removalNote.body } : null,
  },
  e: {
    createAdmin: { status: createAdmin.status, message: createAdmin.json?.message },
    changeTenantRole: { status: roleTenant.status, message: roleTenant.json?.message },
    changeOwnRole: { status: roleSelf.status, message: roleSelf.json?.message },
  },
  f: {
    firstPay: { status: firstPay.status, message: firstPay.json?.message },
    secondPay: { status: secondPay.status, message: secondPay.json?.message },
    mockOff: { ready, status: mockOff.status, message: mockOff.json?.message ?? mockOff.json },
  },
}, null, 2));
