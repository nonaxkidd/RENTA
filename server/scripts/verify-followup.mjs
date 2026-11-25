const BASE = "http://127.0.0.1:5000/api/v1";
const stamp = Date.now().toString().slice(-6);
const pass = "Verify12345!";

async function api(method, route, { token, body, origin } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json, allow: res.headers.get("access-control-allow-origin") };
}

async function login(email, password) {
  const result = await api("POST", "/auth/login", { body: { email, password } });
  return { status: result.status, body: result.json, token: result.json?.token };
}

const superLogin = await login("superadmin@renta.local", "SuperAdmin12345!");
const adminLogin = await login("admin@renta.local", "Admin12345!");
const ownerLogin = await login("owner@gmail.com", "Owner12345!");
const tenantLogin = await login("tenant@gmail.com", "Tenant12345!");

const created = await api("POST", "/admin/users", {
  token: superLogin.token,
  body: {
    firstName: "Token",
    lastName: "Again",
    email: `renta.e.token2.${stamp}@gmail.com`,
    phone: "09170001111",
    role: "owner",
    password: pass,
    adminPassword: "SuperAdmin12345!",
  },
});
const users = await api("GET", "/admin/users", { token: superLogin.token });
const account = users.json.users.find((item) => item.email === `renta.e.token2.${stamp}@gmail.com`);
const session = await login(account.email, pass);
const before = await api("GET", "/listings/mine", { token: session.token });
const deactivated = await api("PATCH", `/admin/users/${account._id}/status`, {
  token: adminLogin.token,
  body: { action: "deactivate", note: "Retest old token" },
});
const afterDeactivate = await api("GET", "/listings/mine", { token: session.token });
await api("PATCH", `/admin/users/${account._id}/status`, { token: adminLogin.token, body: { action: "reactivate" } });
const archived = await api("PATCH", `/admin/users/${account._id}/status`, {
  token: adminLogin.token,
  body: { action: "archive", note: "Retest old token" },
});
const afterArchive = await api("GET", "/listings/mine", { token: session.token });
await api("PATCH", `/admin/users/${account._id}/status`, { token: superLogin.token, body: { action: "restore" } });

const unverified = await login("renta.e.otp.9367873@gmail.com", pass);

const page1 = await api("GET", "/listings?sort=price&limit=2&page=1");
const page2 = await api("GET", "/listings?sort=newest&limit=2&page=1");
const createdListing = await api("POST", "/listings", {
  token: ownerLogin.token,
  body: {
    title: `E edit ${stamp}`,
    type: "Private room",
    barangay: "Ilaya",
    price: 4100,
    description: "Edit check.",
    capacity: 2,
    ownerName: "Maria Santos",
    imageUrl: "https://example.com/renta-photo.jpg",
    lat: 13.36,
    lng: 121.18,
  },
});
const createdId = createdListing.json?.listing?._id;
const approved = await api("PATCH", `/admin/listings/${createdId}/review`, {
  token: adminLogin.token,
  body: { decision: "approve" },
});
const edited = await api("PUT", `/listings/${createdId}`, {
  token: ownerLogin.token,
  body: { price: 4101 },
});
const mine = await api("GET", "/listings/mine", { token: ownerLogin.token });
const removable = mine.json.listings.find((item) => String(item.title).startsWith("E cancel"));
const removed = removable ? await api("DELETE", `/listings/${removable._id}`, { token: ownerLogin.token }) : null;
const gone = removable ? await api("GET", `/listings/${removable._id}`) : null;
const reservations = await api("GET", "/reservations/mine", { token: tenantLogin.token });
const kept = removable
  ? reservations.json.reservations.some((item) => String(item.unitId?._id || item.unitId) === String(removable._id) || item.unitId?.title === removable.title)
  : null;

const profile = await api("PATCH", "/auth/me", {
  token: tenantLogin.token,
  body: { firstName: "Juan", lastName: "Dela Cruz", phone: "09181234567" },
});
const badPassword = await api("PATCH", "/auth/password", {
  token: tenantLogin.token,
  body: { currentPassword: "wrong-password", newPassword: "Another12345!" },
});

const goodOrigin = await api("GET", "/health", { origin: "http://127.0.0.1:5173" });
const badOrigin = await api("GET", "/health", { origin: "http://evil.example" });

console.log(JSON.stringify({
  created: created.status,
  before: before.status,
  deactivate: deactivated.status,
  afterDeactivate: afterDeactivate.status,
  afterDeactivateMessage: afterDeactivate.json?.message,
  archive: archived.status,
  afterArchive: afterArchive.status,
  afterArchiveMessage: afterArchive.json?.message,
  unverifiedLogin: { status: unverified.status, needsOtp: unverified.body?.needsOtp, message: unverified.body?.message },
  pricePage: { status: page1.status, total: page1.json?.total, prices: page1.json?.listings?.map((item) => item.price) },
  newestPage: { status: page2.status, sortLooksNewest: page2.json?.listings?.length },
  edit: { approve: approved.status, status: edited.status, verified: edited.json?.listing?.verified, message: edited.json?.message },
  remove: removed ? { status: removed.status, message: removed.json?.message, publicGet: gone.status, reservationKept: kept } : null,
  profile: { status: profile.status, message: profile.json?.message, phone: profile.json?.user?.phone },
  badPassword: { status: badPassword.status, message: badPassword.json?.message },
  cors: { local: goodOrigin.allow, evil: badOrigin.allow },
}, null, 2));
