import { useState } from "react";
import { CreditCard, Users } from "lucide-react";
import CrmApp from "./CrmApp";
import PayApp from "./PayApp";
import "./App.css";

type Product = "crm" | "pay";

export default function App() {
  const initial = window.location.pathname.startsWith("/pay") ? "pay" : "crm";
  const [product, setProduct] = useState<Product>(initial);

  function select(next: Product) {
    setProduct(next);
    window.history.replaceState({}, "", next === "pay" ? "/pay" : "/crm");
  }

  return <>
    <div className="suite-switcher">
      <button className={product === "crm" ? "active" : ""} onClick={() => select("crm")}><Users size={16}/>Star Comercial</button>
      <button className={product === "pay" ? "active" : ""} onClick={() => select("pay")}><CreditCard size={16}/>Star Financeiro</button>
    </div>
    {product === "crm" ? <CrmApp /> : <PayApp />}
  </>;
}
