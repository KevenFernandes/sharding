# 🛒 E-commerce High-Scalability Architecture: Hash Sharding com PostgreSQL & Citus

Este projeto é uma **Prova de Conceito (PoC)** de uma arquitetura de banco de dados distribuído para e-commerce focada em **alta disponibilidade e escalabilidade horizontal de escrita (_INSERT_)**.

A solução utiliza **Hash-based Sharding** com **Citus** para fatiar e distribuir os dados entre múltiplos nós de banco de dados, permitindo absorver picos de tráfego extremos (como uma **Black Friday**) sem criar gargalos no banco.

---

## 🧐 Por que usar Sharding em vez de 1 Banco Único?

Quando um e-commerce cresce ou enfrenta picos maciços de acessos simultâneos, o modelo tradicional de **banco de dados único (_Monolítico_)** encontra limites físicos:

### O Problema do Banco Único:

1. **Gargalo de CPU e Disco (I/O):** Quando milhares de clientes clicam em "Comprar" ao mesmo tempo, 100% das operações de escrita tentam gravar no mesmo disco e no mesmo processador.
2. **Escalabilidade Vertical Cara e Limitada:** Para aguentar mais carga, você precisa contratar um servidor com mais memória e CPU (_Scale-Up_). Chega um momento em que isso fica astronomicamente caro ou fisicamente impossível.
3. **Fila de Espera (Latência Alta):** O banco começa a enfileirar as requisições. O tempo de resposta sobe de milissegundos para segundos, e o banco pode travar (_Timeout / Crash_).

---

### A Solução com Hash Sharding (Nossa Arquitetura):

Em vez de aumentar o tamanho de um único banco, aplicamos **Escalabilidade Horizontal (_Scale-Out_)**: dividimos a responsabilidade entre **3 bancos de dados independentes (Shards)**.

```text
                         [ k6 / Teste de Carga ]
                                    │
                                    ▼ (HTTP POST /orders)
                        [ API Express (Porta 3000) ]
                                    │
                                    ▼ (Porta 5432)
                        [ Citus Proxy / Coordenador ]
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
  [ Shard Node 0 ]           [ Shard Node 1 ]           [ Shard Node 2 ]
(33% das escritas)         (33% das escritas)         (33% das escritas)
```

Roteamento Transparente: A API Node.js continua conversando apenas com a porta 5432 do Proxy (Citus) como se fosse um banco comum. A API não precisa saber da existência dos 3 shards.

Algoritmo de Hash (MurmurHash3): O Proxy intercepta a coluna user_id, calcula o valor Hash desse ID e distribui o registro para o Shard correspondente.

Carga Dividida: Cada banco de dados recebe apenas ~33% da carga total de CPU, memória e gravação em disco. Se a taxa de tráfego for de 900 compras/s, cada shard processará apenas 300 compras/s.

## ⚡ Comandos do k6

O Grafana k6 é uma ferramenta de teste de carga em Go. Para não precisar instalar dependências pesadas localmente no sistema operacional, executamos o k6 direto dentro de um contêiner Docker temporário.

### O Comando de Execução:

```bash
cat test-blackfriday.js | docker run --rm -i --add-host=host.docker.internal:host-gateway grafana/k6 run -
```

## 🛠️ Passo a Passo para Executar o Projeto

Siga os passos abaixo para subir a infraestrutura, colocar a API no ar e disparar a simulação da Black Friday.

### Pré-requisitos:

- Node.js instalado
- Docker & Docker Compose instalados

### Passo 1: Subir os Contêineres do Banco (Proxy + 3 Shards)

Na raiz do projeto onde está o arquivo docker-compose.yml, rode:

```bash
docker-compose up -d
```

### Passo 2: Criar a Tabela Distribuída no Proxy Citus

Execute o comando SQL abaixo no terminal para criar a tabela orders e configurar o Hash Sharding pela coluna user_id:

```bash
docker exec -it citus_proxy psql -U postgres -d ecommerce -c "
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL,
    user_id VARCHAR(100) NOT NULL,
    product_id VARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (id, user_id)
  );

  SELECT create_distributed_table('orders', 'user_id', 'hash');
"
```

### Passo 3: Iniciar a API em Node.js

Entre na pasta da API (/api), instale as dependências e inicie o servidor:

```Bash
# 1. Instalar as dependências (express e pg)
npm install

# 2. Iniciar o servidor Express
node server.js
```

> (Você verá no terminal: 🚀 API do E-commerce rodando em http://localhost:3000)

### Passo 4: Executar o Teste de Carga da Black Friday (k6)

Com a API rodando no terminal, abra outro terminal na raiz do projeto e execute a bateria de testes:

```Bash
cat test-blackfriday.js | docker run --rm -i --add-host=host.docker.internal:host-gateway grafana/k6 run -
```

## 🔍 Como Comprovar que os Dados foram Distribuídos?

Para ver o relatório de partições gerado pelo Citus e comprovar que as 15.244 compras foram divididas entre os 3 bancos físicos, rode no terminal:

```bash
docker exec -it citus_proxy psql -U postgres -d ecommerce -c "
  SELECT
    nodename AS shard_node,
    count(*) AS total_shards,
    sum(shard_size)/1024 AS tamanho_kb
  FROM citus_shards
  WHERE table_name::text = 'orders'
  GROUP BY nodename;
"
```

Você verá que a carga de dados e o peso de armazenamento foram distribuídos de forma equilibrada (~33% para cada nó):
| shard_node | total_shards | tamanho_kb |
| --- | --- | --- |
| **shard_0** | 10 | ~120 KB |
| **shard_1** | 11 | ~125 KB |
| **shard_2** | 11 | ~125 KB |
