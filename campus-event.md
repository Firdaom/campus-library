# Campus Library API -- Team 12

**Production Base URL**

``` text
https://campus-library-mu.vercel.app
```

**Endpoint**

``` http
GET /api/integrations/catalog
```

**Authentication**

Required header:

``` http
Authorization: Bearer YOUR_API_KEY
```

API Key: ขอรับจาก Campus Library Team ผ่านช่องทางส่วนตัว

**Query Parameters**

  Parameter    Description                 Default
  ------------ --------------------------- ---------
  `q`          Search by keyword           None
  `category`   Filter by category          None
  `page`       Page number                 1
  `limit`      Results per page (max 50)   20

**Example Request**

``` http
GET https://campus-library-mu.vercel.app/api/integrations/catalog?q=programming&page=1&limit=20
```

**Example Response**

``` json
{
  "resources": [
    {
      "id": "76937be2-6475-43a3-b7d3-6c904f014dcc",
      "title": "Clean Code",
      "author": "Robert C. Martin",
      "category": "Programming",
      "description": "A practical guide to writing readable, maintainable code.",
      "available_copies": 2,
      "total_copies": 2,
      "details_url": "https://campus-library-mu.vercel.app/books/76937be2-6475-43a3-b7d3-6c904f014dcc"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "total_pages": 1
  }
}
```

**Response Fields**

-   `id`: Resource ID
-   `title`: Resource title
-   `author`: Author
-   `category`: Resource category
-   `description`: Resource description
-   `available_copies`: Available copies
-   `total_copies`: Total copies
-   `details_url`: Resource details page

**HTTP Status**

-   `200`: Success
-   `401`: Invalid or missing API key
-   `500`: Server/API configuration error

**Production Test:** Successfully tested with HTTP 200 OK.

API KEYS:
CAMPUS_EVENTS_CLUBS_API_KEY=710b3c5c4d7b19bbaa2cdc58c006ed14b2d7744f21f4dd5688d5f51693fd5a9f

**Note:** Read-only catalog API. Borrowing and reservation operations
are not supported.
