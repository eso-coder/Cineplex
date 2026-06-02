# Movie Streaming Platform — Backend API

Production-ready REST API built with Node.js, Express, MongoDB.

## Quick Start

```bash
cd backend
npm install
# Edit .env with your values
npm run seed      # Seed genres + admin user
npm run dev       # Start dev server (port 5000)
```

**Default admin credentials (after seed):**
- Email: `admin@movie.com`
- Password: `Admin123!`

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default 5000) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | Access token secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Refresh token secret (min 32 chars) |
| `JWT_ACCESS_EXPIRY` | Access token TTL (default `15m`) |
| `JWT_REFRESH_EXPIRY` | Refresh token TTL (default `7d`) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `CLIENT_URL` | Frontend origin for CORS |

---

## API Reference

### Response Format

```jsonc
// Success
{ "success": true, "message": "...", "data": { } }

// Paginated
{ "success": true, "data": [...], "pagination": { "page": 1, "limit": 10, "total": 150, "totalPages": 15 } }

// Error
{ "success": false, "message": "...", "error": { "code": "VALIDATION_ERROR", "details": [...] } }
```

### Auth  `/api/auth`

| Method | Path | Auth | Body |
|--------|------|------|------|
| POST | `/register` | ❌ | `name, email, password` |
| POST | `/login` | ❌ | `email, password` |
| POST | `/logout` | ✅ | — |
| POST | `/refresh-token` | Cookie | — |
| GET | `/me` | ✅ | — |
| PATCH | `/update-profile` | ✅ | `name?, email?` |
| PATCH | `/change-password` | ✅ | `currentPassword, newPassword` |
| POST | `/upload-avatar` | ✅ | `multipart: avatar` |

### Movies  `/api/movies`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/` | ❌ | `?page, limit, genre, year, sort, search` |
| GET | `/featured` | ❌ | isFeatured=true |
| GET | `/trending` | ❌ | sorted by views |
| GET | `/search?q=` | ❌ | full-text search |
| GET | `/:id` | ❌ | — |
| POST | `/:id/view` | ❌ | increments view count |
| POST | `/:id/favorite` | ✅ | toggle |
| POST | `/:id/watchlist` | ✅ | toggle |
| GET | `/user/favorites` | ✅ | — |
| GET | `/user/watchlist` | ✅ | — |

### Comments  `/api/comments`

| Method | Path | Auth |
|--------|------|------|
| GET | `/movie/:movieId` | ❌ |
| POST | `/movie/:movieId` | ✅ |
| PATCH | `/:id` | ✅ (owner) |
| DELETE | `/:id` | ✅ (owner/admin) |
| POST | `/:id/like` | ✅ |
| POST | `/:id/reply` | ✅ |

### Ratings  `/api/ratings`

| Method | Path | Auth |
|--------|------|------|
| POST | `/movie/:movieId` | ✅ |
| GET | `/movie/:movieId/my-rating` | ✅ |
| DELETE | `/movie/:movieId` | ✅ |

### Admin  `/api/admin`  (admin role required)

| Method | Path |
|--------|------|
| GET | `/dashboard` |
| GET/PATCH/DELETE | `/users` / `/users/:id` |
| POST/PATCH/DELETE | `/movies` / `/movies/:id` |
| GET/DELETE | `/comments` / `/comments/:id` |
| POST/PATCH/DELETE | `/genres` / `/genres/:id` |

---

## Scripts

```bash
npm run dev      # nodemon dev server
npm start        # production server
npm run seed     # seed database
```

Import `postman_collection.json` into Postman to test all endpoints.
