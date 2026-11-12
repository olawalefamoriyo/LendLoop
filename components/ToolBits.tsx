"use client";

import { formatDate } from "@/lib/format";
import { Badge } from "./ui";

type Availability = { status: "available"; nextReservedFrom?: string } | { status: "on_loan"; until: string };

export function AvailabilityBadge({ availability }: { availability: Availability }) {
  if (availability.status === "on_loan") {
    return (
      <Badge tone="amber" dot>
        On loan until {formatDate(availability.until)}
      </Badge>
    );
  }
  return (
    <Badge tone="green" dot>
      Available
    </Badge>
  );
}
