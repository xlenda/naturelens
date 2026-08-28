# Identificação por som — servidor de inferência

Isto liga a aba **Sons** do NatureLens. Está pronto para subir; o app já sabe
conversar com ele.

## Por que existe um servidor separado

O modelo Perch 2.0 em ONNX tem **390 MB**. A Vercel limita o pacote de uma
função serverless a 250 MB, e baixar 390 MB para o celular de alguém está fora
de questão. Então o modelo mora aqui e a Vercel só conversa com este endereço —
o mesmo desenho já usado com Kindwise, Fishial e Nyckel.

## Por que Perch e não BirdNET

| | BirdNET | **Perch 2.0** |
|---|---|---|
| Licença dos pesos | CC BY-NC-SA (**não-comercial**) | **Apache 2.0** (comercial liberado) |
| Classes | 6.522 aves | **~14.795** |
| Cobertura | só aves | aves + sapos + grilos + gafanhotos + mamíferos |
| Precisa de permissão | sim, e-mail para o Cornell | **não** |

O BirdNET é mais conhecido, mas a licença dele proíbe uso comercial — e a
cláusula *ShareAlike* faz até um modelo ajustado a partir dele herdar a mesma
restrição. Para um app com assinatura, está descartado sem licença. O Perch é
Apache 2.0 e cobre mais.

## Onde hospedar

Qualquer um destes aguenta 390 MB. Precisa de **~2 GB de RAM livre**.

### Hugging Face Space (Docker) — recomendado
1. huggingface.co → **New Space** → SDK **Docker**
2. Sobe `Dockerfile`, `app.py` e `requirements.txt`
3. A URL fica `https://SEU-USUARIO-NOME.hf.space`

⚠️ Space com Docker exige plano PRO (US$9/mês) em conta pessoal. Contas grátis
podem ter até 2 Spaces Gradio no ZeroGPU — dá para adaptar, mas entra em fila.

### Fly.io / Render / Railway
Mesmo Dockerfile. Todos têm faixa gratuita ou barata com RAM suficiente.

### Seu próprio VPS
```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```
⚠️ O VPS em 74.1.21.165 entrega ~2 GB de RAM. É o mínimo — vai funcionar, mas
sem folga. Se der falta de memória, é isso.

## Ligando no app

Na Vercel, duas variáveis:

```
PERCH_ENDPOINT    = https://seu-host/            (obrigatória)
PERCH_AUTH_TOKEN  = segredo-aleatorio-com-32-ou-mais-caracteres (obrigatorio)
```

Defina `AUTH_TOKEN` com o **mesmo valor** no servidor. O host se recusa a
iniciar sem um segredo de pelo menos 32 caracteres, e a Vercel se recusa a
habilitar Som sem endpoint HTTPS + token.

O host fixa revisões completas e SHA-256 do modelo e das duas tabelas de
taxonomia. Divergência de hash ou de quantidade de classes interrompe a
inferência; nunca substitua esses valores por `main` nem atualize somente um dos
três artefatos. O corpo também é autenticado e limitado antes de o Pydantic
materializar o áudio.

Não existe chave pública no build para liberar o recurso: o botão permanece
coerente entre web, Android e iOS. Sem endpoint HTTPS **e** token válido, a API
responde que a identificação por som está indisponível sem encaminhar áudio ao
host. Assim, uma configuração incompleta falha fechada em vez de criar um fluxo
sem autenticação.

## Contrato

**Entrada** `POST /`
```json
{ "audio": "<base64 de PCM float32 mono>", "sample_rate": 32000, "top_k": 3 }
```

**Saída**
```json
{ "predictions": [
  { "label": "perfal", "common_name": "Peregrine Falcon",
    "scientific_name": "Falco peregrinus", "code": "perfal",
    "group": "bird", "score": 0.87 }
]}
```

O **app** decodifica e reamostra o áudio para 32 kHz mono antes de enviar — o
navegador tem `AudioContext` para isso, e assim o servidor não precisa de
ffmpeg nem libsndfile. É o que mantém a imagem pequena e fácil de hospedar.

O servidor **recusa** áudio que não esteja em 32 kHz em vez de adivinhar:
alimentar um modelo de 32 kHz com 44,1 kHz desloca todas as frequências e gera
resposta confiante e errada — pior que um erro.

## Primeira chamada é lenta

O modelo baixa (390 MB) e carrega na primeira requisição, não no boot — de
propósito: plataforma que checa a porta antes disso marcaria o container como
quebrado e reiniciaria em loop. Conte ~40-60 s na primeiríssima chamada, e
poucos segundos depois. `GET /health` responde sem tocar no modelo.
