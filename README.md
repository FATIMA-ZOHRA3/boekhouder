# Boekhouder web app

A simple Next.js demo for bookkeepers with two roles:

- **Client portal**: create invoices, view fiscal numbers, VAT, KVK and company info
- **Bookkeeper dashboard**: review invoices, assign categories, and mark invoices as processed

## Run locally

1. Open a terminal in this project folder
2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open:

```text
http://localhost:3000
```

## Main routes

- `/` home page
- `/client` client portal
- `/client/invoices/new` create invoice
- `/bookkeeper` bookkeeper dashboard
- `/bookkeeper/invoices/[id]` invoice review page

## Notes

- This is a **frontend demo with in-memory data** in `src/lib/data.ts`
- Data resets when you restart the app
- API routes are included under `src/app/api/...`
- For production, connect this to a real database and authentication

## Suggested next step

Add:

- Supabase or PostgreSQL
- login/authentication
- PDF invoice export
- file upload for receipts and purchase invoices
- real bookkeeping journal entries
