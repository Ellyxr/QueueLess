import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  ChevronRight,
  Clock3,
  MapPin,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  UserCircle2,
  Pizza,
  Salad,
  Fish,
  Sandwich,
  Soup,
  Croissant,
  IceCream,
  Coffee,
  Apple,
  Flame,
  Leaf,
  Utensils,
  Milk,
  Sun,
  Cookie,
  SearchX,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { MarketplacePromoCard } from "@/components/marketplace-promo-card";
import { StoreItemCard } from "@/components/store-item-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const categories = [
  "Pizza",
  "Burgers",
  "Sushi",
  "Salads",
  "Noodles",
  "Bakery",
  "Coffee",
  "Desserts",
  "Healthy",
  "BBQ",
  "Vegan",
  "Wraps",
  "Pasta",
  "Thai",
  "Mexican",
  "Korean",
  "Seafood",
  "Bubble Tea",
  "Sandwiches",
  "Breakfast",
  "Ice Cream",
  "Snacks",
  "Chicken",
  "Rice Bowls",
  "Smoothies",
];

const categoryIcons: Record<string, React.ReactNode> = {
  Pizza: <Pizza className="h-5 w-5" />,
  Burgers: <Sandwich className="h-5 w-5" />,
  Sushi: <Fish className="h-5 w-5" />,
  Salads: <Salad className="h-5 w-5" />,
  Noodles: <Soup className="h-5 w-5" />,
  Bakery: <Croissant className="h-5 w-5" />,
  Coffee: <Coffee className="h-5 w-5" />,
  Desserts: <IceCream className="h-5 w-5" />,
  Healthy: <Apple className="h-5 w-5" />,
  BBQ: <Flame className="h-5 w-5" />,
  Vegan: <Leaf className="h-5 w-5" />,
  Pasta: <Utensils className="h-5 w-5" />,
  Thai: <Soup className="h-5 w-5" />,
  Mexican: <Flame className="h-5 w-5" />,
  Korean: <Utensils className="h-5 w-5" />,
  Seafood: <Fish className="h-5 w-5" />,
  "Bubble Tea": <Milk className="h-5 w-5" />,
  Sandwiches: <Sandwich className="h-5 w-5" />,
  Breakfast: <Sun className="h-5 w-5" />,
  "Ice Cream": <IceCream className="h-5 w-5" />,
  Snacks: <Cookie className="h-5 w-5" />,
  Chicken: <Utensils className="h-5 w-5" />,
  "Rice Bowls": <Soup className="h-5 w-5" />,
  Smoothies: <Sparkles className="h-5 w-5" />,
};

const featuredVendors = [
  {
    name: "North Loop Kitchen",
    eta: "18-22 min",
    rating: 4.9,
    type: "Community kitchen",
  },
  {
    name: "Sunset Bowl Co.",
    eta: "12-18 min",
    rating: 4.8,
    type: "Healthy picks",
  },
  {
    name: "Harbor Bites",
    eta: "20-25 min",
    rating: 4.7,
    type: "Student favorite",
  },
  {
    name: "Wild Ember Grill",
    eta: "14-20 min",
    rating: 4.9,
    type: "Chef specials",
  },
  {
    name: "Garden Grove",
    eta: "13-18 min",
    rating: 4.8,
    type: "Fresh bowls",
  },
  {
    name: "MNL Pantry",
    eta: "15-20 min",
    rating: 4.6,
    type: "Daily specials",
  },
  {
    name: "Saffron Cart",
    eta: "17-24 min",
    rating: 4.9,
    type: "Rice & curry",
  },
  {
    name: "Crumb & Co.",
    eta: "9-13 min",
    rating: 4.7,
    type: "Bakery bites",
  },
];

const localVendors = [
  {
    name: "Elm Street Cafe",
    eta: "8-12 min",
    rating: 4.8,
    type: "Coffee & snacks",
  },
  {
    name: "Cinder Flatbread",
    eta: "16-22 min",
    rating: 4.9,
    type: "Fresh oven",
  },
  {
    name: "Bamboo Lane",
    eta: "15-20 min",
    rating: 4.7,
    type: "Vegan & rice bowls",
  },
  { name: "Old Town Deli", eta: "10-15 min", rating: 4.7, type: "Sandwiches" },
  {
    name: "Luna Sip Bar",
    eta: "7-11 min",
    rating: 4.8,
    type: "Cold drinks",
  },
  {
    name: "Tandoor Nest",
    eta: "18-25 min",
    rating: 4.9,
    type: "Indian comfort",
  },
  {
    name: "Noodle District",
    eta: "14-18 min",
    rating: 4.7,
    type: "Noodles",
  },
  {
    name: "Sunbeam Corner",
    eta: "5-10 min",
    rating: 4.6,
    type: "Breakfast hub",
  },
];

const vendorMenuItems: Record<string, Array<{ image: string; name: string; flavorProfile: string; price: number }>> = {
  "North Loop Kitchen": [
    {
      image: "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=800&q=80",
      name: "Banh Mi Combo",
      flavorProfile: "Savory, fresh, crunchy",
      price: 165,
    },
    {
      image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
      name: "Gochujang Chicken Bowl",
      flavorProfile: "Spicy, smoky, umami",
      price: 210,
    },
    {
      image: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80",
      name: "Crispy Tofu Wrap",
      flavorProfile: "Citrusy, crunchy, vibrant",
      price: 175,
    },
  ],
  "Sunset Bowl Co.": [
    {
      image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80",
      name: "Salmon Glow Bowl",
      flavorProfile: "Citrusy, fresh, buttery",
      price: 240,
    },
    {
      image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
      name: "Garden Protein Salad",
      flavorProfile: "Herby, crisp, clean",
      price: 185,
    },
    {
      image: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80",
      name: "Almond Berry Oat",
      flavorProfile: "Sweet, nutty, bright",
      price: 150,
    },
  ],
  "Harbor Bites": [
    {
      image: "https://images.unsplash.com/photo-1562967916-eb82221dfb92?auto=format&fit=crop&w=800&q=80",
      name: "Seafood Rice Box",
      flavorProfile: "Sea-salty, aromatic, comforting",
      price: 225,
    },
    {
      image: "https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=800&q=80",
      name: "Street Fish Tacos",
      flavorProfile: "Tangy, smoky, light",
      price: 190,
    },
    {
      image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
      name: "Crispy Calamari",
      flavorProfile: "Crunchy, zesty, savory",
      price: 180,
    },
  ],
  "Wild Ember Grill": [
    {
      image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80",
      name: "Firehouse Burger",
      flavorProfile: "Smoky, juicy, bold",
      price: 210,
    },
    {
      image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
      name: "Charred Chicken Plate",
      flavorProfile: "Bold, savory, caramelized",
      price: 220,
    },
    {
      image: "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=800&q=80",
      name: "Smoky BBQ Fries",
      flavorProfile: "Tangy, crispy, rich",
      price: 140,
    },
  ],
  "Garden Grove": [
    {
      image: "https://images.unsplash.com/photo-1546793665-c74683f339c1?auto=format&fit=crop&w=800&q=80",
      name: "Miso Greens Bowl",
      flavorProfile: "Umami, earthy, fresh",
      price: 170,
    },
    {
      image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
      name: "Coconut Tofu Rice",
      flavorProfile: "Creamy, mellow, herbal",
      price: 195,
    },
    {
      image: "https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?auto=format&fit=crop&w=800&q=80",
      name: "Mango Crunch Cup",
      flavorProfile: "Sweet, tropical, vibrant",
      price: 120,
    },
  ],
  "MNL Pantry": [
    {
      image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80",
      name: "Daily Stir-Fry",
      flavorProfile: "Garlicky, savory, satisfying",
      price: 175,
    },
    {
      image: "https://images.unsplash.com/photo-1526318896980-cf78c088247c?auto=format&fit=crop&w=800&q=80",
      name: "Sinigang Rice Set",
      flavorProfile: "Tangy, warming, hearty",
      price: 215,
    },
    {
      image: "https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=800&q=80",
      name: "Street Corn Rice Bowl",
      flavorProfile: "Creamy, smoky, sweet",
      price: 165,
    },
  ],
  "Saffron Cart": [
    {
      image: "https://images.unsplash.com/photo-1604908554107-7ecf36210625?auto=format&fit=crop&w=800&q=80",
      name: "Chicken Kebab Plate",
      flavorProfile: "Warm, spiced, juicy",
      price: 205,
    },
    {
      image: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80",
      name: "Coconut Curry Rice",
      flavorProfile: "Rich, aromatic, comforting",
      price: 185,
    },
    {
      image: "https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=800&q=80",
      name: "Saffron Naan Duo",
      flavorProfile: "Buttery, savory, fragrant",
      price: 160,
    },
  ],
  "Crumb & Co.": [
    {
      image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80",
      name: "Butter Croissant",
      flavorProfile: "Flaky, buttery, warm",
      price: 95,
    },
    {
      image: "https://images.unsplash.com/photo-1483695028939-5bb13f8648b0?auto=format&fit=crop&w=800&q=80",
      name: "Strawberry Danish",
      flavorProfile: "Sweet, fruity, creamy",
      price: 120,
    },
    {
      image: "https://images.unsplash.com/photo-1505253716362-afaea1d3d1af?auto=format&fit=crop&w=800&q=80",
      name: "Mooncake Bites",
      flavorProfile: "Rich, comforting, lightly sweet",
      price: 110,
    },
  ],
  "Elm Street Cafe": [
    {
      image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80",
      name: "Honey Cinnamon Latte",
      flavorProfile: "Sweet, warm, smooth",
      price: 125,
    },
    {
      image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=800&q=80",
      name: "Cheese Toastie",
      flavorProfile: "Toasty, creamy, savory",
      price: 115,
    },
    {
      image: "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=800&q=80",
      name: "Blueberry Muffin",
      flavorProfile: "Soft, fruity, comforting",
      price: 90,
    },
  ],
  "Cinder Flatbread": [
    {
      image: "https://images.unsplash.com/photo-1548365328-9f547fb9587c?auto=format&fit=crop&w=800&q=80",
      name: "Margherita Flatbread",
      flavorProfile: "Herby, cheesy, oven-fired",
      price: 170,
    },
    {
      image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
      name: "Truffle Mushroom Slice",
      flavorProfile: "Earthy, savory, rich",
      price: 185,
    },
    {
      image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
      name: "Pepperoni Fire Slice",
      flavorProfile: "Spicy, smoky, crunchy",
      price: 195,
    },
  ],
  "Bamboo Lane": [
    {
      image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80",
      name: "Tofu Rice Bowl",
      flavorProfile: "Fresh, umami, balanced",
      price: 180,
    },
    {
      image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
      name: "Citrus Greens Box",
      flavorProfile: "Bright, crisp, clean",
      price: 160,
    },
    {
      image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
      name: "Miso Sesame Bowl",
      flavorProfile: "Nutty, savory, silky",
      price: 175,
    },
  ],
  "Old Town Deli": [
    {
      image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80",
      name: "Roast Chicken Melt",
      flavorProfile: "Savory, rich, comforting",
      price: 170,
    },
    {
      image: "https://images.unsplash.com/photo-1553909489-cd47e0ef937f?auto=format&fit=crop&w=800&q=80",
      name: "Turkey Club Stack",
      flavorProfile: "Fresh, crisp, hearty",
      price: 180,
    },
    {
      image: "https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=800&q=80",
      name: "Crispy Chicken Ciabatta",
      flavorProfile: "Crunchy, juicy, herby",
      price: 185,
    },
  ],
  "Luna Sip Bar": [
    {
      image: "https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=800&q=80",
      name: "Lychee Iced Tea",
      flavorProfile: "Sweet, floral, refreshing",
      price: 110,
    },
    {
      image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=800&q=80",
      name: "Mango Chill Shake",
      flavorProfile: "Tropical, creamy, vibrant",
      price: 135,
    },
    {
      image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80",
      name: "Citrus Spritz",
      flavorProfile: "Zesty, sparkling, light",
      price: 100,
    },
  ],
  "Tandoor Nest": [
    {
      image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80",
      name: "Paneer Masala",
      flavorProfile: "Rich, aromatic, warm",
      price: 200,
    },
    {
      image: "https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=800&q=80",
      name: "Butter Chicken Rice",
      flavorProfile: "Creamy, savory, fragrant",
      price: 230,
    },
    {
      image: "https://images.unsplash.com/photo-1631452180519-c014fe922b7e?auto=format&fit=crop&w=800&q=80",
      name: "Chana Samosa Box",
      flavorProfile: "Spiced, crisp, comforting",
      price: 155,
    },
  ],
  "Noodle District": [
    {
      image: "https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=800&q=80",
      name: "Spicy Ramen",
      flavorProfile: "Brothy, bold, deep",
      price: 200,
    },
    {
      image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
      name: "Yaki Udon Bowl",
      flavorProfile: "Savory, smoky, chewy",
      price: 190,
    },
    {
      image: "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=800&q=80",
      name: "Sesame Noodles",
      flavorProfile: "Nutty, silky, aromatic",
      price: 175,
    },
  ],
  "Sunbeam Corner": [
    {
      image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
      name: "Protein Breakfast Set",
      flavorProfile: "Hearty, savory, balanced",
      price: 150,
    },
    {
      image: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=800&q=80",
      name: "Berry Yogurt Bowl",
      flavorProfile: "Fresh, creamy, sweet",
      price: 120,
    },
    {
      image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
      name: "Ham & Egg Wrap",
      flavorProfile: "Satisfying, savory, bright",
      price: 145,
    },
  ],
};

function FoodCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-border bg-card p-3 shadow-sm",
        compact && "p-2.5",
      )}
    >
      <div className="animate-pulse">
        <div className="mb-3 h-24 rounded-[16px] bg-muted" />
        <div className="mb-2 h-3 w-20 rounded-full bg-muted" />
        <div className="h-4 w-32 rounded-full bg-muted" />
        <div className="mt-4 flex items-center justify-between">
          <div className="h-3 w-16 rounded-full bg-muted" />
          <div className="h-3 w-14 rounded-full bg-muted" />
        </div>
      </div>
    </div>
  );
}

function VendorCard({
  name,
  eta,
  rating,
  type,
}: {
  name: string;
  eta: string;
  rating: number;
  type: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const menuItems = vendorMenuItems[name] ?? [];
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isExpanded) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isExpanded]);

  return (
    <motion.div
      ref={cardRef}
      layout
      transition={{ type: "spring", stiffness: 220, damping: 24, mass: 0.9 }}
      style={{
        gridColumn: isExpanded ? "span 2" : "span 1",
        transformOrigin: "left center",
        willChange: "grid-column, transform",
      }}
      className="relative h-full"
      onClick={() => setIsExpanded((current) => !current)}
    >
      <Card
        className={cn(
          "h-full overflow-hidden border-card-border/80 bg-card/90 shadow-sm backdrop-blur-sm transition-[width,transform] duration-500 ease-out",
          isExpanded && "ring-1 ring-primary/30 shadow-md",
        )}
      >
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                {type}
              </p>
              <p className="mt-1 text-base font-semibold tracking-[-0.04em] text-card-foreground">
                {name}
              </p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-secondary-foreground">
              <Star className="h-3 w-3 fill-current" />
              {rating}
            </span>
          </div>

          <AnimatePresence mode="wait">
            {!isExpanded ? (
              <motion.div
                key="collapsed"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="space-y-3 p-4"
              >
                <div className="grid grid-cols-2 gap-2">
                  <FoodCardSkeleton compact />
                  <FoodCardSkeleton compact />
                </div>

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" />
                    <span>{eta}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-full px-3 py-1.5 text-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsExpanded(true);
                    }}
                  >
                    View menu
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="expanded"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="space-y-3 p-4"
              >
                <motion.div
                  layout
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className={cn(
                    "gap-3 md:grid md:grid-cols-2",
                    menuItems.length >= 3 ? "overflow-x-auto pb-2 md:max-h-[260px] md:overflow-y-auto md:overflow-x-hidden" : "grid",
                    menuItems.length >= 3 && "flex snap-x snap-mandatory md:flex-none",
                  )}
                  style={
                    menuItems.length >= 3
                      ? { scrollbarWidth: "none", msOverflowStyle: "none" }
                      : undefined
                  }
                >
                  {menuItems.map((item) => (
                    <motion.div
                      key={item.name}
                      initial={{ opacity: 0, scale: 0.97, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className={cn(
                        menuItems.length >= 3 && "min-w-[220px] shrink-0 snap-start md:min-w-0",
                      )}
                    >
                      <StoreItemCard
                        image={item.image}
                        name={item.name}
                        flavorProfile={item.flavorProfile}
                        price={item.price}
                      />
                    </motion.div>
                  ))}
                </motion.div>

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" />
                    <span>{eta}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-full px-3 py-1.5 text-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      window.location.href = `/store/${encodeURIComponent(name)}`;
                    }}
                  >
                    View Page
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function MarketplacePage({
  username = "Jamie",
  isLoggedIn = true,
}: {
  username?: string;
  isLoggedIn?: boolean;
}) {
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // US-011: Search and Category Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const visibleCategories = showAllCategories ? categories : categories.slice(0, 8);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(timer);
  }, []);

  // US-011: Sync search query with URL parameter set by AppShell navbar
  useEffect(() => {
    const updateSearchFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setSearchQuery(params.get("search") || "");
    };

    updateSearchFromUrl();
    window.addEventListener("popstate", updateSearchFromUrl);
    return () => window.removeEventListener("popstate", updateSearchFromUrl);
  }, []);

  // Filter helper logic for US-011
  const matchesFilter = (vendor: { name: string; type: string }) => {
    const q = searchQuery.toLowerCase().trim();
    const cat = selectedCategory?.toLowerCase() || "";

    const menuItems = vendorMenuItems[vendor.name] || [];
    const hasMatchingMenuItem = menuItems.some(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.flavorProfile.toLowerCase().includes(q)
    );

    const matchesQuery =
      !q ||
      vendor.name.toLowerCase().includes(q) ||
      vendor.type.toLowerCase().includes(q) ||
      hasMatchingMenuItem;

    const matchesCategory =
      !selectedCategory ||
      vendor.type.toLowerCase().includes(cat) ||
      vendor.name.toLowerCase().includes(cat) ||
      menuItems.some(
        (item) =>
          item.name.toLowerCase().includes(cat) ||
          item.flavorProfile.toLowerCase().includes(cat)
      );

    return matchesQuery && matchesCategory;
  };

  const filteredFeatured = featuredVendors.filter(matchesFilter);
  const filteredLocal = localVendors.filter(matchesFilter);
  const hasResults = filteredFeatured.length > 0 || filteredLocal.length > 0;

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-[1440px] px-4 pb-14 pt-4 sm:px-6 lg:px-10">
        <div className="flex min-h-[60vh] items-center justify-center rounded-[28px] border border-border/80 bg-background/80 p-6 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-full border border-border bg-card px-5 py-3 shadow-sm">
            <Spinner className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Loading marketplace...</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 pb-14 pt-4 sm:px-6 lg:px-10">
      <div className="rounded-[28px] border border-border/80 bg-background/80 p-3 shadow-sm backdrop-blur-sm sm:p-4">
        
        <section className="mt-4 space-y-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Good afternoon
              </p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.07em] text-foreground sm:text-5xl lg:text-[4rem]">
                Hello, 
                <span className="pl-2 text-primary">
                  {username}
                </span>
              </h1>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              <span>National University - Laguna</span>
            </div>
          </div>

          <MarketplacePromoCard
            title="Banh Mi Feast"
            storeName="North Loop Kitchen"
            rating={4.9}
            price={215}
            image="https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80"
          />
        </section>

        {/* US-011: Category Filters Section */}
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Categories
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">
                Browse food
              </h3>
            </div>
            <Button
              variant="ghost"
              onClick={() => setShowAllCategories((current) => !current)}
              className="gap-1.5 rounded-full text-sm text-muted-foreground hover:bg-secondary"
            >
              {showAllCategories ? "Show less" : "View all"}
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform duration-300 ease-out",
                  showAllCategories && "rotate-90",
                )}
              />
            </Button>
          </div>

          <div
            className={cn(
              "grid gap-3 transition-all duration-300 ease-out",
              showAllCategories
                ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
                : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-8",
            )}
          >
            {visibleCategories.map((category) => {
              const isSelected = selectedCategory === category;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() =>
                    setSelectedCategory(isSelected ? null : category)
                  }
                  className={cn(
                    "group flex items-center gap-2 rounded-full border border-border bg-card p-2.5 text-left shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
                    showAllCategories ? "justify-start" : "justify-center",
                    isSelected && "border-primary bg-primary/10 ring-1 ring-primary/40"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110",
                      isSelected && "bg-primary text-primary-foreground"
                    )}
                  >
                    {categoryIcons[category] || <Utensils className="h-4 w-4" />}
                  </div>
                  <p
                    className={cn(
                      "text-sm font-medium text-card-foreground",
                      isSelected && "font-semibold text-primary"
                    )}
                  >
                    {category}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* US-011: Results or No-Results View */}
        {!hasResults ? (
          <div className="my-12 flex flex-col items-center justify-center rounded-3xl border border-dashed border-border p-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <SearchX className="h-8 w-8" />
            </div>
            <h4 className="mt-4 text-xl font-bold tracking-tight text-foreground">
              No food or vendors found
            </h4>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              We couldn't find anything matching "{searchQuery || selectedCategory}". Try searching for something else or clear your filters.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.delete("search");
                window.history.replaceState({}, "", url.toString());
                setSearchQuery("");
                setSelectedCategory(null);
              }}
              className="mt-6 rounded-full px-6"
            >
              Clear Search & Filters
            </Button>
          </div>
        ) : (
          <section className="mt-10 space-y-8">
            {filteredFeatured.length > 0 && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Sampaloc Lane
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">
                      Vendor picks
                    </h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <Button variant="ghost" className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary">
                      View all
                    </Button>
                  </div>
                </div>

                <div className="md:hidden">
                  <div className="overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    <div className="flex min-w-[980px] gap-4">
                      {filteredFeatured.map((vendor) => (
                        <div key={vendor.name} className="w-[220px] min-w-[220px] flex-none">
                          <VendorCard {...vendor} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="hidden md:grid md:grid-cols-4 md:gap-4 [grid-auto-flow:dense]">
                  {filteredFeatured.map((vendor) => (
                    <VendorCard key={vendor.name} {...vendor} />
                  ))}
                </div>
              </div>
            )}

            {filteredLocal.length > 0 && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Student vendors
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">
                      Quick bites
                    </h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-secondary-foreground">
                      24/7
                    </span>
                    <Button variant="ghost" className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary">
                      View all
                    </Button>
                  </div>
                </div>

                <div className="md:hidden">
                  <div className="overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    <div className="flex min-w-[980px] gap-4">
                      {filteredLocal.map((vendor) => (
                        <div key={vendor.name} className="w-[220px] min-w-[220px] flex-none">
                          <VendorCard {...vendor} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="hidden md:grid md:grid-cols-4 md:gap-4 [grid-auto-flow:dense]">
                  {filteredLocal.map((vendor) => (
                    <VendorCard key={vendor.name} {...vendor} />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}