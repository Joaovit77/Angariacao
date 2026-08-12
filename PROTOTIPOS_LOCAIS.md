# Protótipos locais

## Identificação de imóveis por fotografia

Existe um protótipo experimental mantido apenas neste computador:

```text
C:\Users\Corretor\Documents\GitHub\Angariacao\mapillary-facade-test
```

A pasta está incluída no `.gitignore` e não deve ser enviada ao GitHub. Ela é isolada do sistema principal de angariação e não interfere em seu funcionamento.

### Objetivo do protótipo

O protótipo foi criado para testar a identificação de fachadas a partir de uma fotografia, usando:

- imagens públicas do Mapillary;
- localização aproximada por cidade e bairro;
- embeddings locais com OpenCLIP;
- um índice visual armazenado no próprio computador;
- interface separada em Streamlit.

### Estado atual

O experimento está **pausado e não deve ser integrado ao sistema principal**.

Foi criado um índice local do Centro de Londrina com aproximadamente 34.782 imagens. Os testes demonstraram que o Mapillary contém a fachada procurada, mas o modelo visual genérico não consegue colocá-la de forma confiável entre os primeiros resultados quando recebe apenas uma fotografia e o bairro.

A abordagem poderá ser retomada no futuro combinando a imagem com uma ou mais pistas adicionais, como:

- localização aproximada do celular;
- rua ou trecho selecionado no mapa;
- OCR de nomes, placas e números;
- várias fotografias do mesmo imóvel;
- uma base própria de fachadas identificadas.

### Orientações para agentes

- Não modificar, mover, apagar ou integrar `mapillary-facade-test` sem solicitação explícita do usuário.
- Não remover a entrada `mapillary-facade-test/` do `.gitignore`.
- Nunca publicar o arquivo `.env`, o token do Mapillary ou a pasta `.facade-cache`.
- Preservar o índice local, pois sua geração levou várias horas.
- Trabalhos no sistema principal devem ignorar essa pasta, salvo quando o usuário pedir expressamente para retomar o protótipo.

