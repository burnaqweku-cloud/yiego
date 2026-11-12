import Services from "@/pages/Services";
import ServiceOrder from "@/pages/ServiceOrder";
import { useStore } from "@/components/store/StoreShell";
import { storeBase } from "@/lib/storeHost";

/* Services inside an agent's store: the same screens as the main site, showing only what this store sells,
   at this store's prices and under its name. */
export default function StoreServices() {
  const store = useStore();
  return <Services store={{ slug: store.slug, name: store.store_name, base: `${storeBase(store.slug)}/services` }} />;
}
export function StoreServiceOrder() {
  const store = useStore();
  return <ServiceOrder back={{ to: `${storeBase(store.slug)}/services`, label: "Back to services" }} />;
}
