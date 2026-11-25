import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import "./Login.css";

function MockPayment() {
  const { paymentId } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState(0);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/payments/mock/${paymentId}`)
      .then((response) => {
        setTitle(response.data.payment.title);
        setAmount(response.data.payment.amount);
        setStatus(response.data.payment.status);
      })
      .catch((error) => setMessage(error.response?.data?.message || "Couldn't open this payment."));
  }, [paymentId]);

  async function pay() {
    setBusy(true);
    setMessage("");
    try {
      await api.post(`/payments/mock/${paymentId}/pay`);
      setStatus("paid");
      setMessage("Payment confirmed. The listing is now reserved.");
    } catch (error: any) {
      setMessage(error.response?.data?.message || "Payment could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await api.post(`/payments/mock/${paymentId}/cancel`);
      navigate("/tenant");
    } catch (error: any) {
      setMessage(error.response?.data?.message || "Couldn't cancel this payment.");
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-card">
          <p className="login-eyebrow">TEST PAYMENT</p>
          <h2>Down payment</h2>
          <p>{title || "Listing"}</p>
          <p>₱{amount.toLocaleString()}</p>
          <p>Status: {status || "loading"}</p>
          {message && <div className="login-message">{message}</div>}
          {status === "pending" && (
            <>
              <button type="button" className="login-button" disabled={busy} onClick={pay}>Pay</button>
              <button type="button" className="login-button" disabled={busy} onClick={cancel}>Cancel</button>
            </>
          )}
          <Link to="/tenant">Back to your account</Link>
        </div>
      </div>
    </div>
  );
}

export default MockPayment;
