// Seed data example for testing
export const seedTrip = {
  name: "Fuji Autumn 2027",
  description: "Trip to see autumn leaves at Fuji",
  country: "Japan",
  city: "Fujikawaguchiko",
  startDate: "2027-11-10",
  endDate: "2027-11-14",
  timezone: "Asia/Tokyo",
  baseCurrency: "JPY",
  themeColor: "#2f6fe4",
  status: "active"
};

export const seedMembers = [
  { displayName: "Alice", username: "alice", role: "trip_admin", color: "#2f6fe4" },
  { displayName: "Bob", username: "bob", role: "member", color: "#64a1da" },
  { displayName: "Charlie", username: "charlie", role: "member", color: "#3f9d94" }
];

export const seedItinerary = [
  { title: "Arrive at Haneda", date: "2027-11-10", startAt: "2027-11-10T10:00:00", durationMinutes: 120, travelToNextMinutes: 90, coordinates: "35.5494,139.7798", category: "transport" },
  { title: "Lake Kawaguchi", date: "2027-11-11", startAt: "2027-11-11T09:00:00", durationMinutes: 180, travelToNextMinutes: 30, coordinates: "35.4961,138.7688", category: "sightseeing" }
];

export const seedExpenses = [
  { title: "Train to Fuji", subtotalMinor: 500000, currency: "JPY", payerId: "alice", allocations: [{ memberId: "alice", amountMinor: 166666 }, { memberId: "bob", amountMinor: 166667 }, { memberId: "charlie", amountMinor: 166667 }] }
];
