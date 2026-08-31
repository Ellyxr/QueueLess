import { useEffect, useState } from "react";
import StorePage, {
  emptyMenuStore,
  singleCategoryStore,
  dualCategoryStore,
} from "./storepage";

const storeDatabase: Record<string, typeof emptyMenuStore> = {
  "coming-soon-cafe": emptyMenuStore,
  "elm-street-cafe": singleCategoryStore,
  "cinder-flatbread": dualCategoryStore,
  // Map actual vendor names to store data
  "North Loop Kitchen": {
    storeName: "North Loop Kitchen",
    rating: 4.9,
    eta: "18-22 min",
    storeType: "Community kitchen",
    bannerImage:
      "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
    avatarInitial: "N",
    categories: [
      {
        categoryName: "Asian Fusion",
        items: [
          {
            image:
              "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=800&q=80",
            name: "Banh Mi Combo",
            flavorProfile: "Savory, fresh, crunchy",
            price: 165,
          },
          {
            image:
              "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
            name: "Gochujang Chicken Bowl",
            flavorProfile: "Spicy, smoky, umami",
            price: 210,
          },
          {
            image:
              "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80",
            name: "Crispy Tofu Wrap",
            flavorProfile: "Citrusy, crunchy, vibrant",
            price: 175,
          },
        ],
      },
    ],
  },
  "Sunset Bowl Co.": {
    storeName: "Sunset Bowl Co.",
    rating: 4.8,
    eta: "12-18 min",
    storeType: "Healthy picks",
    bannerImage:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=80",
    avatarInitial: "S",
    categories: [
      {
        categoryName: "Bowls",
        items: [
          {
            image:
              "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80",
            name: "Salmon Glow Bowl",
            flavorProfile: "Citrusy, fresh, buttery",
            price: 240,
          },
          {
            image:
              "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
            name: "Garden Protein Salad",
            flavorProfile: "Herby, crisp, clean",
            price: 185,
          },
        ],
      },
    ],
  },
  "Harbor Bites": {
    storeName: "Harbor Bites",
    rating: 4.7,
    eta: "20-25 min",
    storeType: "Student favorite",
    bannerImage:
      "https://images.unsplash.com/photo-1562967916-eb82221dfb92?auto=format&fit=crop&w=1200&q=80",
    avatarInitial: "H",
    categories: [
      {
        categoryName: "Seafood",
        items: [
          {
            image:
              "https://images.unsplash.com/photo-1562967916-eb82221dfb92?auto=format&fit=crop&w=800&q=80",
            name: "Seafood Rice Box",
            flavorProfile: "Sea-salty, aromatic, comforting",
            price: 225,
          },
          {
            image:
              "https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=800&q=80",
            name: "Street Fish Tacos",
            flavorProfile: "Tangy, smoky, light",
            price: 190,
          },
        ],
      },
    ],
  },
  "Wild Ember Grill": {
    storeName: "Wild Ember Grill",
    rating: 4.9,
    eta: "14-20 min",
    storeType: "Chef specials",
    bannerImage:
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=80",
    avatarInitial: "W",
    categories: [
      {
        categoryName: "Grilled Specialties",
        items: [
          {
            image:
              "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80",
            name: "Firehouse Burger",
            flavorProfile: "Smoky, juicy, bold",
            price: 210,
          },
          {
            image:
              "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
            name: "Charred Chicken Plate",
            flavorProfile: "Bold, savory, caramelized",
            price: 220,
          },
        ],
      },
    ],
  },
  "Garden Grove": {
    storeName: "Garden Grove",
    rating: 4.8,
    eta: "13-18 min",
    storeType: "Fresh bowls",
    bannerImage:
      "https://images.unsplash.com/photo-1546793665-c74683f339c1?auto=format&fit=crop&w=1200&q=80",
    avatarInitial: "G",
    categories: [
      {
        categoryName: "Vegetarian Bowls",
        items: [
          {
            image:
              "https://images.unsplash.com/photo-1546793665-c74683f339c1?auto=format&fit=crop&w=800&q=80",
            name: "Miso Greens Bowl",
            flavorProfile: "Umami, earthy, fresh",
            price: 170,
          },
          {
            image:
              "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
            name: "Coconut Tofu Rice",
            flavorProfile: "Creamy, mellow, herbal",
            price: 195,
          },
        ],
      },
    ],
  },
  "MNL Pantry": {
    storeName: "MNL Pantry",
    rating: 4.6,
    eta: "15-20 min",
    storeType: "Daily specials",
    bannerImage:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    avatarInitial: "M",
    categories: [
      {
        categoryName: "Local Favorites",
        items: [
          {
            image:
              "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80",
            name: "Daily Stir-Fry",
            flavorProfile: "Garlicky, savory, satisfying",
            price: 175,
          },
          {
            image:
              "https://images.unsplash.com/photo-1526318896980-cf78c088247c?auto=format&fit=crop&w=800&q=80",
            name: "Sinigang Rice Set",
            flavorProfile: "Tangy, warming, hearty",
            price: 215,
          },
        ],
      },
    ],
  },
  "Saffron Cart": {
    storeName: "Saffron Cart",
    rating: 4.9,
    eta: "17-24 min",
    storeType: "Rice & curry",
    bannerImage:
      "https://images.unsplash.com/photo-1604908554107-7ecf36210625?auto=format&fit=crop&w=1200&q=80",
    avatarInitial: "S",
    categories: [
      {
        categoryName: "Indian Cuisine",
        items: [
          {
            image:
              "https://images.unsplash.com/photo-1604908554107-7ecf36210625?auto=format&fit=crop&w=800&q=80",
            name: "Chicken Kebab Plate",
            flavorProfile: "Warm, spiced, juicy",
            price: 205,
          },
          {
            image:
              "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80",
            name: "Coconut Curry Rice",
            flavorProfile: "Rich, aromatic, comforting",
            price: 185,
          },
        ],
      },
    ],
  },
  "Crumb & Co.": {
    storeName: "Crumb & Co.",
    rating: 4.7,
    eta: "9-13 min",
    storeType: "Bakery bites",
    bannerImage:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80",
    avatarInitial: "C",
    categories: [
      {
        categoryName: "Pastries",
        items: [
          {
            image:
              "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80",
            name: "Butter Croissant",
            flavorProfile: "Flaky, buttery, warm",
            price: 95,
          },
          {
            image:
              "https://images.unsplash.com/photo-1483695028939-5bb13f8648b0?auto=format&fit=crop&w=800&q=80",
            name: "Strawberry Danish",
            flavorProfile: "Sweet, fruity, creamy",
            price: 120,
          },
        ],
      },
    ],
  },
};

export function StoreRouter() {
  const [storeData, setStoreData] = useState<typeof emptyMenuStore | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    // Get store name from URL
    const pathSegments = window.location.pathname.split("/");
    const storeName = pathSegments[pathSegments.length - 1];
    const decodedStoreName = decodeURIComponent(storeName);

    // Find store in database
    const store = storeDatabase[decodedStoreName];

    if (store) {
      setStoreData(store);
    } else {
      setIsNotFound(true);
    }
  }, []);

  if (isNotFound) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Store not found</h1>
          <p className="mt-2 text-muted-foreground">The store you're looking for doesn't exist.</p>
          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            className="mt-6 rounded-full bg-primary px-6 py-2 font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to marketplace
          </button>
        </div>
      </main>
    );
  }

  if (!storeData) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading store...</div>
      </main>
    );
  }

  return <StorePage {...storeData} />;
}
