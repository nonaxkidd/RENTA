# RENTA

Long-term rental listings for Calapan City. The React app is in `client`. The API is in `server`.

## Gmail App Password setup

OTP email uses Nodemailer and a Gmail App Password. This is not your normal Gmail password.

1. Open the Google Account that will send the codes: https://myaccount.google.com/
2. Go to **Security**.
3. Turn on **2-Step Verification** if it is off. App passwords stay hidden until this is on.
4. Search the account page for **App passwords**, or open https://myaccount.google.com/apppasswords
5. Name the password `RENTA` and click **Create**.
6. Copy the 16-character password Google shows. Spaces in the display can be removed.
7. In `server/.env` set:
   - `GMAIL_USER` to that Gmail address
   - `GMAIL_APP_PASSWORD` to the 16-character app password
8. Restart the API.
9. For local testing without sending mail, you may set `OTP_LOG_CODE=true`. The code is printed in the API console only when `NODE_ENV` is not `production`.
10. Production refuses to start when `OTP_LOG_CODE=true`, when `DOCUMENT_ENCRYPTION_KEY` is empty, or when `PAYMONGO_MOCK=true`.

## Local demo accounts

After `server/src/scripts/seedLocalUsers.ts` against the local database:

- superadmin@renta.local / SuperAdmin12345!
- admin@renta.local / Admin12345!
- owner@gmail.com / Owner12345!
- tenant@gmail.com / Tenant12345!

These accounts are for local demos only.

## Test checklist

- Register a tenant with a Gmail address and a phone that is `09XXXXXXXXX` or `+639XXXXXXXXX`. The same rules appear on Admin → Add user and Edit user. Admin and superadmin may use a non-Gmail address.
- Sign in, enter the 6-digit code, and use **Resend code** after the 60 second cooldown.
- Use **Forgot password**, enter the email, then the code, then a new password. An unknown email gets the same success message.
- Repeat login or register quickly and confirm the rate-limit message.
- Sign in as superadmin. Add an admin. Deactivate and restore an admin. A normal admin cannot deactivate, archive, or change the role of an admin, a superadmin, or their own account. The last active superadmin cannot be removed. Blocked attempts appear in the audit log.
- As an owner, upload an ID and proof of authority (JPEG, PNG, WEBP, or PDF, 5 MB). Confirm an admin can open the file and the audit log records the view. Create a listing with a photo file or a photo URL.
- On the landing page, search by title, barangay, and type. Listing pages say Photos and do not open a 360 tour.
- As a tenant, open **Reservations**, pay the down payment on the local mock page (`PAYMONGO_MOCK=true`), and print the receipt after it is confirmed. The listing stays Available until that payment is confirmed.
- As an admin, open **Payments**, filter by status, and mark a `needs_refund` payment refunded. The audit log records it.
- Leave the tenant and owner dashboards open and confirm reservations refresh about every 30 seconds. Notification bells show an unread count.

## Start everything

Use three terminals. Keep the first one open. Closing it drops the local database.

1. Local Mongo, from `server`:
   `npx tsx src/scripts/localMongo.ts`
   Wait until it prints `LOCAL_MONGO_READY`. The URI is `mongodb://127.0.0.1:27018/renta`. Put that in `server/.env` as `MONGODB_URI`.
2. Seed, from `server`:
   `npm run seed:demo`
   This creates the demo accounts if they are missing, about 12 approved listings with local placeholder photos, one pending owner with documents, one disapproved listing, one reservation in each status, and a few notifications. Running it again does not duplicate those rows.
3. API, from `server`:
   `npm run dev`
   It listens on http://localhost:5000.
4. Client, from `client`:
   `npm run dev`
   Open http://127.0.0.1:5173.

Demo sign-in, local only:

- tenant@gmail.com / Tenant12345!
- owner@gmail.com / Owner12345!
- admin@renta.local / Admin12345!
- superadmin@renta.local / SuperAdmin12345!
- Pending owner: demo.pending.owner@gmail.com / Owner12345!

## Demo script

Tenant

1. Open http://127.0.0.1:5173 and choose Sign in.
2. Sign in as tenant@gmail.com.
3. On Discover, type `Ilaya` in the search box. The matches come from the API, not a sample list.
4. Open a demo listing that is still available.
5. Choose a future move-in date and send a reservation request.
6. Open Reservations. When the status is waiting for payment, start the down payment and confirm it on the mock pay page.
7. Return to the listing. After the payment is confirmed, leave a star rating and a short comment.

Owner

1. Sign out and sign in as owner@gmail.com.
2. Open the owner dashboard and add a listing: barangay from the dropdown, pin inside Calapan, and a photo file.
3. Open reservation requests and approve the earliest one. The tenant then owes one month of rent, using the price at the moment you approve.
4. Edit the title or description of an approved listing. It goes back to pending review and the admins get a notification.
5. Remove a listing that still has a queued or unpaid reservation. Those reservations and pending payments are cancelled, and the tenant is notified.

Admin

1. Sign in as admin@renta.local.
2. Open the pending owner `demo.pending.owner@gmail.com` and view the submitted ID and proof of authority.
3. Approve or disapprove a listing. The disapproved demo listing already has a review note and does not appear on the public page.
4. Open Payments and filter by status.
5. Try to add a user with the admin role, or change a tenant into an admin. Both are refused.

Superadmin

1. Sign in as superadmin@renta.local.
2. Add a user with the admin role. A normal admin cannot do this.
3. Deactivate that admin, then restore the account.
4. A normal admin still cannot deactivate this superadmin. The last active superadmin cannot be deactivated, archived, or moved to another role.

## Troubleshooting

- Atlas IP: a cloud `MONGODB_URI` fails until your current IP is allowed in the Atlas network access list. For a local demo, use the `27018` memory server instead.
- DNS: home networks sometimes block MongoDB SRV lookups. The API already asks `8.8.8.8` and `1.1.1.1`. If a `mongodb+srv` URI still fails, use the local server.
- Stale service worker: if the site shows an old page, open DevTools, Application, Service Workers, unregister it, then hard-refresh http://127.0.0.1:5173.
- Gmail app password: OTP mail needs `GMAIL_USER` and a Google App Password in `server/.env`, not the normal Gmail password. See the setup steps above. Local testing can set `OTP_LOG_CODE=true` and read the code in the API console.
- PayMongo test keys: real checkout needs `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` from the PayMongo test dashboard. For the demo, set `PAYMONGO_MOCK=true` and use the local Pay page. Production refuses to start with the mock turned on.
- Data lost when localMongo stops: the database on port `27018` lives only in that process. Stop it and the listings, users, and payments are gone. Start it again and run `npm run seed:demo`.
