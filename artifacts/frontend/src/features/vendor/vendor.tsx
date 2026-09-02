import { useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Inbox,
  Megaphone,
  Menu as MenuIcon,
  PackageCheck,
  ShoppingBag,
  Store,
  UserCircle2,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createPortal } from 'react-dom';
import { useRequireAuth } from '@/hooks/use-require-auth';

interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  image?: string;
}

const navItems = ['Home', 'Transactions', 'Inbox', 'Profile'];

const performanceCards = [
  { label: 'Today', value: '124', caption: '+12.4%' },
  { label: 'Avg. ticket', value: '$18.40', caption: '+3.1%' },
  { label: 'Pending', value: '18', caption: '-5.2%' },
];

const recentOrders = [
  { id: '#1048', customer: 'Alicia M.', item: 'Burrito Bowl', total: '$18.50', status: 'Preparing' },
  { id: '#1047', customer: 'Daniel R.', item: 'Pesto Pasta', total: '$21.00', status: 'Out for delivery' },
  { id: '#1046', customer: 'Nina P.', item: 'Salad Wrap', total: '$15.75', status: 'Completed' },
  { id: '#1045', customer: 'Victor S.', item: 'Smoothie', total: '$8.00', status: 'Pending' },
];

const initialProducts: Product[] = [
  {
    id: 'prod-1',
    name: 'Banh Mi Combo',
    price: 165,
    description: 'Savory, fresh, crunchy baguette sandwich with iced tea.',
    category: 'Sandwiches',
    image: 'https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'prod-2',
    name: 'Gochujang Chicken Bowl',
    price: 210,
    description: 'Spicy, smoky, umami glazed chicken over warm rice.',
    category: 'Rice Bowls',
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'prod-3',
    name: 'Crispy Tofu Wrap',
    price: 175,
    description: 'Citrusy, crunchy, vibrant plant-based wrap.',
    category: 'Wraps',
    image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80',
  },
];

export default function VendorPage({ username = 'Jordan' }: { username?: string }) {
  useRequireAuth(['vendor', 'student_vendor', 'admin']);

  // US-012 State Management
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    description: '',
    category: '',
    image: '',
  });
  const [imagePreview, setImagePreview] = useState<string>('');
  const [formErrors, setFormErrors] = useState<{ name?: string; price?: string; description?: string }>({});
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        price: product.price.toString(),
        description: product.description,
        category: product.category || 'General',
        image: product.image || '',
      });
      setImagePreview(product.image || '');
    } else {
      setEditingProduct(null);
      setFormData({ name: '', price: '', description: '', category: '', image: '' });
      setImagePreview('');
    }
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Handle Local File Upload from File Explorer / Gallery
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setFormData((prev) => ({ ...prev, image: result }));
        setImagePreview(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const validateForm = () => {
    const errors: { name?: string; price?: string; description?: string } = {};
    if (!formData.name.trim()) errors.name = 'Product name is required';
    if (!formData.price.trim()) {
      errors.price = 'Price is required';
    } else if (isNaN(Number(formData.price)) || Number(formData.price) <= 0) {
      errors.price = 'Price must be a valid positive number';
    }
    if (!formData.description.trim()) errors.description = 'Description is required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const finalCategory = formData.category.trim() ? formData.category.trim() : 'General';
    const finalImage = formData.image.trim()
      ? formData.image.trim()
      : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80';

    if (editingProduct) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? {
                ...p,
                name: formData.name.trim(),
                price: Number(formData.price),
                description: formData.description.trim(),
                category: finalCategory,
                image: finalImage,
              }
            : p
        )
      );
      showToast('Product updated successfully!');
    } else {
      const newProd: Product = {
        id: `prod-${Date.now()}`,
        name: formData.name.trim(),
        price: Number(formData.price),
        description: formData.description.trim(),
        category: finalCategory,
        image: finalImage,
      };
      setProducts((prev) => [newProd, ...prev]);
      showToast('New product added to store!');
    }

    setIsModalOpen(false);
  };

  const handleDeleteProduct = () => {
    if (!deleteTargetId) return;
    setProducts((prev) => prev.filter((p) => p.id !== deleteTargetId));
    setDeleteTargetId(null);
    showToast('Product deleted from menu', 'error');
  };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-10 relative">
      {/* Feedback Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl px-4 py-3 shadow-xl backdrop-blur-md transition-all ${
            toastMessage.type === 'success'
              ? 'border border-emerald-500/30 bg-emerald-950/80 text-emerald-200'
              : 'border border-destructive/30 bg-destructive/90 text-destructive-foreground'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
        </div>
      )}

      <div className="rounded-[28px] border border-border/80 bg-background/80 p-3 shadow-sm backdrop-blur-sm sm:p-4">
        <header className="flex items-center justify-between gap-3 rounded-[22px] border border-border/80 bg-card/80 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <span className="h-4 w-4 rounded-full border-[1.5px] border-current" />
            </div>
            <div className="hidden sm:block">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">QueueLess</p>
            </div>
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => (
              <Button
                key={item}
                variant={item === 'Home' ? 'default' : 'ghost'}
                className={item === 'Home' ? 'rounded-full px-4 py-2' : 'rounded-full px-4 py-2 text-foreground hover:bg-secondary'}
              >
                {item}
              </Button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="rounded-full border border-border/80 bg-background text-foreground">
              <Inbox className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full border border-border/80 bg-background text-foreground">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="secondary" className="gap-2 rounded-full px-3 py-2 sm:px-4">
              <UserCircle2 className="h-4 w-4" />
              <span className="hidden sm:inline">{username}</span>
            </Button>
          </div>
        </header>

        <section className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Good afternoon</p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.07em] text-foreground sm:text-5xl lg:text-[4rem]">
                Hello, {username}
              </h1>
            </div>

            <div className="flex items-center gap-3 rounded-full border border-border bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
              <ShoppingBag className="h-4 w-4 text-primary" />
              <span>North Courtyard Kitchen</span>
            </div>
          </div>

          <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary via-primary to-primary/85 text-primary-foreground shadow-md">
            <CardContent className="flex flex-col gap-6 p-5 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-md">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/80">Total sales</p>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-4xl font-bold tracking-[-0.07em] sm:text-5xl">$24,560</span>
                  <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary-foreground/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-primary-foreground">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    +12.4%
                  </span>
                </div>
              </div>

              <div className="flex min-w-[210px] flex-col gap-4 rounded-[22px] border border-primary-foreground/15 bg-primary-foreground/5 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between text-sm text-primary-foreground/80">
                  <span>vs last week</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em]">+8.6k</span>
                </div>
                <div className="flex items-end gap-2">
                  {[42, 58, 46, 78, 68, 90, 100].map((height, index) => (
                    <div
                      key={height + index}
                      className="w-full rounded-t-full bg-primary-foreground/85"
                      style={{ height: `${height}px` }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-primary-foreground/80">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Quick Actions */}
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Quick actions</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">Manage your store</h2>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Orders', icon: PackageCheck, onClick: () => {} },
              {
                label: 'Menu',
                icon: MenuIcon,
                onClick: () => {
                  document.getElementById('menu-management-section')?.scrollIntoView({ behavior: 'smooth' });
                },
              },
              { label: 'Store', icon: Store, onClick: () => {} },
              { label: 'Promotion', icon: Megaphone, onClick: () => {} },
            ].map(({ label, icon: Icon, onClick }) => (
              <Button
                key={label}
                variant="secondary"
                onClick={onClick}
                className="flex h-20 items-center justify-between rounded-[22px] border border-border bg-secondary/60 px-4 py-4 text-left shadow-sm hover:bg-secondary"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background text-primary shadow-sm">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-base font-medium text-foreground">{label}</span>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </Button>
            ))}
          </div>
        </section>

        {/* US-012: Product Management Section */}
        <section id="menu-management-section" className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Catalog CRUD</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-foreground">Menu Products</h2>
            </div>
            <Button
              onClick={() => handleOpenModal()}
              className="gap-2 rounded-full px-4 py-2 font-medium"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </Button>
          </div>

          <Card className="border-card-border/80 bg-card/90 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="grid grid-cols-[1.5fr_1fr_2fr_1fr] gap-3 border-b border-border bg-secondary/40 px-4 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <span>Product Name</span>
                <span>Price</span>
                <span>Description</span>
                <span className="text-right">Actions</span>
              </div>

              {products.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No products in your catalog yet. Click "Add Item" to create one.
                </div>
              ) : (
                products.map((product) => (
                  <div
                    key={product.id}
                    className="grid grid-cols-[1.5fr_1fr_2fr_1fr] items-center gap-3 border-b border-border/80 px-4 py-4 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{product.name}</p>
                      <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-[9px] font-mono text-muted-foreground uppercase">
                        {product.category}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-primary">₱{product.price}</p>
                    <p className="text-sm text-muted-foreground line-clamp-1">{product.description}</p>

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenModal(product)}
                        className="h-8 w-8 rounded-full border border-border/80 hover:bg-secondary"
                        title="Edit product"
                      >
                        <Pencil className="h-3.5 w-3.5 text-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTargetId(product.id)}
                        className="h-8 w-8 rounded-full border border-destructive/30 text-destructive hover:bg-destructive/10"
                        title="Delete product"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        {/* Performance Cards */}
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {performanceCards.map((card) => (
            <Card key={card.label} className="border-card-border/80 bg-card/90 shadow-sm">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">{card.value}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-primary">
                  {card.caption.startsWith('-') ? (
                    <ArrowDownRight className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Recent Orders */}
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Recent activity</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-foreground">Recent orders</h2>
            </div>
          </div>

          <Card className="border-card-border/80 bg-card/90 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-hidden rounded-[20px]">
                <div className="grid grid-cols-[0.8fr_1.2fr_0.8fr_0.8fr] gap-3 border-b border-border bg-secondary/40 px-4 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  <span>Order</span>
                  <span>Customer</span>
                  <span>Item</span>
                  <span className="text-right">Status</span>
                </div>

                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="grid grid-cols-[0.8fr_1.2fr_0.8fr_0.8fr] items-center gap-3 border-b border-border/80 px-4 py-4 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{order.id}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{order.total}</p>
                    </div>
                    <p className="text-sm text-foreground">{order.customer}</p>
                    <p className="text-sm text-muted-foreground">{order.item}</p>
                    <div className="text-right">
                      <span
                        className={[
                          'inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em]',
                          order.status === 'Completed' && 'bg-emerald-500/10 text-emerald-600',
                          order.status === 'Preparing' && 'bg-amber-500/10 text-amber-600',
                          order.status === 'Out for delivery' && 'bg-blue-500/10 text-blue-600',
                          order.status === 'Pending' && 'bg-slate-500/10 text-slate-600',
                        ].join(' ')}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* US-012: Add/Edit Product Modal */}
      {isModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4 pt-10 backdrop-blur-md overflow-y-auto">
            <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl my-8">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-lg font-bold text-foreground">
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProduct} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Banh Mi Combo"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  {formErrors.name && <p className="mt-1 text-xs text-destructive">{formErrors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                    Price (₱)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="150"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  {formErrors.price && <p className="mt-1 text-xs text-destructive">{formErrors.price}</p>}
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                    Category <span className="text-[10px] text-muted-foreground/70 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g. Rice Bowls, Drinks, Snacks"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {/* File Explorer / Gallery Picker */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                    Product Photo <span className="text-[10px] text-muted-foreground/70 font-normal">(Optional)</span>
                  </label>

                  <div className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-secondary/30 p-4 transition-colors hover:bg-secondary/50">
                    {imagePreview ? (
                      <div className="relative w-full h-32 overflow-hidden rounded-xl">
                        <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            setImagePreview('');
                            setFormData((prev) => ({ ...prev, image: '' }));
                          }}
                          className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center cursor-pointer w-full py-2">
                        <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                        <span className="text-xs font-medium text-foreground">Upload from Device / Gallery</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG, WEBP up to 5MB</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-[1px] flex-1 bg-border" />
                    <span className="text-[10px] uppercase font-mono text-muted-foreground">or image url</span>
                    <div className="h-[1px] flex-1 bg-border" />
                  </div>

                  <input
                    type="url"
                    value={formData.image.startsWith('data:') ? '' : formData.image}
                    onChange={(e) => {
                      const url = e.target.value;
                      setFormData({ ...formData, image: url });
                      setImagePreview(url);
                    }}
                    placeholder="https://images.unsplash.com/..."
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                    Description / Flavor Profile
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Short description of ingredients or taste..."
                    rows={3}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                  {formErrors.description && (
                    <p className="mt-1 text-xs text-destructive">{formErrors.description}</p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-full px-4"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="rounded-full px-5">
                    {editingProduct ? 'Save Changes' : 'Create Product'}
                  </Button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* US-012: Delete Confirmation Modal */}
      {deleteTargetId &&
        createPortal(
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
            <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-3">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Delete Product</h3>
              <p className="mt-2 text-xs text-muted-foreground">
                Are you sure you want to remove this item from your menu catalog? This action cannot be undone.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setDeleteTargetId(null)}
                  className="rounded-full px-5"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteProduct}
                  className="rounded-full px-5"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </main>
  );
}