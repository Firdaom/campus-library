
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

function isValidApiKey(req: Request): boolean {
    const expectedKey = process.env.CAMPUS_EVENTS_CLUBS_API_KEY;
    const authorization = req.headers.get("authorization");

    if (!expectedKey || !authorization) {
        return false;
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
        return false;
    }

    const providedBuffer = Buffer.from(match[1]);
    const expectedBuffer = Buffer.from(expectedKey);

    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
}

function getPositiveInteger(
    value: string | null,
    defaultValue: number
): number | null {
    if (value === null) return defaultValue;

    if (!/^[1-9]\d*$/.test(value)) return null;

    const parsed = Number(value);

    return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function GET(req: Request) {
    try {
        // 1. Check API Key
        if (!process.env.CAMPUS_EVENTS_CLUBS_API_KEY) {
            return NextResponse.json(
                { error: "Integration API is not configured." },
                { status: 500 }
            );
        }

        if (!isValidApiKey(req)) {
            return NextResponse.json(
                { error: "Unauthorized." },
                { status: 401 }
            );
        }

        // 2. Read query parameters
        const { searchParams } = new URL(req.url);

        const q = searchParams.get("q")?.trim() ?? "";
        const category = searchParams.get("category")?.trim() ?? "";

        const page = getPositiveInteger(searchParams.get("page"), 1);
        const limit = getPositiveInteger(searchParams.get("limit"), 20);

        if (q.length > 200 || category.length > 100) {
            return NextResponse.json(
                { error: "Search parameter too long." },
                { status: 400 }
            );
        }

        if (page === null || limit === null || limit > 50) {
            return NextResponse.json(
                { error: "Invalid pagination parameters." },
                { status: 400 }
            );
        }

        // 3. Calculate pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) {
            return NextResponse.json(
                { error: "Invalid pagination parameters." },
                { status: 400 }
            );
        }

        // 4. Query catalog
        const supabase = createServiceClient();

        let query = supabase
            .from("resource_availability")
            .select(
                "id, title, author, category, description, available_copies, total_copies",
                { count: "exact" }
            )
            .order("title")
            .range(from, to);

        // Search title, author, category, and description
        if (q) {
            const escapedQ = q
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"');

            const pattern = `"%${escapedQ}%"`;

            query = query.or(
                [
                    `title.ilike.${pattern}`,
                    `author.ilike.${pattern}`,
                    `category.ilike.${pattern}`,
                    `description.ilike.${pattern}`,
                ].join(",")
            );
        }

        if (category) {
            query = query.eq("category", category);
        }

        const { data, error, count } = await query;

        if (error) {
            console.error("Catalog integration query failed:", error);

            return NextResponse.json(
                { error: "Unable to retrieve catalog resources." },
                { status: 500 }
            );
        }

        // 5. Return only public catalog fields
        const resources = (data ?? []).map((resource: {
            id: string;
            title: string;
            author: string | null;
            category: string;
            description: string | null;
            available_copies: number;
            total_copies: number;
        }) => ({
            id: resource.id,
            title: resource.title,
            author: resource.author,
            category: resource.category,
            description: resource.description,
            available_copies: resource.available_copies,
            total_copies: resource.total_copies,
            details_url: new URL(
                `/books/${resource.id}`,
                req.url
            ).toString(),
        }));

        const total = count ?? 0;

        return NextResponse.json({
            resources,
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Catalog integration API error:", error);

        return NextResponse.json(
            { error: "Internal server error." },
            { status: 500 }
        );
    }
}
