import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      
      addItem: (product, quantity = 1) => {
        const items = get().items
        // Check for existing item with same product AND variant (if any)
        const variantId = product.variant?.id || null
        const existing = items.find(i => 
          i.product.id === product.id && 
          (i.product.variant?.id || null) === variantId
        )
        
        if (existing) {
          set({
            items: items.map(i =>
              i.product.id === product.id && (i.product.variant?.id || null) === variantId
                ? { ...i, quantity: i.quantity + quantity }
                : i
            )
          })
        } else {
          set({ items: [...items, { product, quantity }] })
        }
      },
      
      removeItem: (productId, variantId = null) => {
        set({ 
          items: get().items.filter(i => 
            !(i.product.id === productId && (i.product.variant?.id || null) === variantId)
          ) 
        })
      },
      
      updateQuantity: (productId, quantity, variantId = null) => {
        if (quantity <= 0) {
          get().removeItem(productId, variantId)
          return
        }
        set({
          items: get().items.map(i =>
            i.product.id === productId && (i.product.variant?.id || null) === variantId
              ? { ...i, quantity } 
              : i
          )
        })
      },
      
      clearCart: () => set({ items: [] }),
      
      get total() {
        return get().items.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
      },
      
      get count() {
        return get().items.reduce((sum, i) => sum + i.quantity, 0)
      }
    }),
    {
      name: 'gimmick-cart'
    }
  )
)
