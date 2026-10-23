import { Navigate, useLocation } from "react-router-dom";

/** Old /promo links (already shared in ads) open the main shop with promotion pricing. */
export default function Promotion() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("promo", "1");
  return <Navigate to={`/shop?${params.toString()}`} replace />;
}
