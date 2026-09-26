import http from "k6/http";
import { check } from "k6";

export const options = {
  // Simula 30 usuários virtuais (VUs) fazendo compras simultâneas por 20 segundos
  vus: 30,
  duration: "20s",
};

export default function () {
  // Gera um ID de usuário aleatório para testar o espalhamento por Hash
  const randomUserId = `user_${Math.floor(Math.random() * 100000)}`;

  const payload = JSON.stringify({
    userId: randomUserId,
    productId: "prod_blackfriday_99",
    amount: 299.9,
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
    },
  };

  // Dispara a requisição de compra para a sua API
  const res = http.post(
    "http://host.docker.internal:3000/orders",
    payload,
    params,
  );

  // Valida se a API respondeu com Sucesso (201 Created)
  check(res, {
    "pedido realizado": (r) => r.status === 201,
  });
}
