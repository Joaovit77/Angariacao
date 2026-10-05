-- Vendas V1-B2: operações controladas. Aplicação Supabase é um gate separado.
-- BEGIN VENDAS V1-B2
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create function private.vendas_b2_erro(p_codigo text, p_motivo text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_estado text; v_mensagem text;
begin
  v_estado := case p_codigo
    when 'nao-autenticado' then 'PT401' when 'nao-encontrado' then 'PT404'
    when 'versao-conflitante' then 'PT409' when 'chave-idempotencia-conflitante' then 'PT409'
    when 'conflito-transitorio' then 'PT503'
    when 'falha-interna' then 'PT500' when 'dado-persistido-invalido' then 'PT500'
    else 'PT422' end;
  v_mensagem := case p_codigo
    when 'nao-autenticado' then 'Sessão necessária.'
    when 'nao-encontrado' then 'Oportunidade não encontrada.'
    when 'versao-conflitante' then 'A oportunidade mudou desde a leitura.'
    when 'chave-idempotencia-conflitante' then 'Esta chave pertence a outro pedido.'
    when 'estrutura-invalida' then 'Comando fora do contrato.'
    when 'versao-invalida' then 'Versão esperada inválida.'
    when 'transicao-invalida' then 'Transição não permitida.'
    when 'estado-terminal' then 'A oportunidade está encerrada.'
    when 'oportunidade-arquivada' then 'A oportunidade está arquivada.'
    when 'contato-invalido' then 'Contato não disponível para esta operação.'
    when 'imovel-invalido' then 'Imóvel não disponível para esta operação.'
    when 'modo-imovel-invalido' then 'Identificação do imóvel inválida.'
    when 'imovel-obrigatorio' then 'Informe o imóvel tratado.'
    when 'origem-invalida' then 'Origem comercial inválida.'
    when 'valor-invalido' then 'Valor fora do contrato numérico.'
    when 'valor-fechado-incompativel' then 'Valor fechado permitido somente no ganho.'
    when 'data-invalida' then 'Data ou instante inválido.'
    when 'data-futura' then 'A data do fato não pode ser futura em Brasília.'
    when 'ganho-invalido' then 'Requisitos do ganho não atendidos.'
    when 'perda-invalida' then 'Requisitos da perda não atendidos.'
    when 'arquivamento-invalido' then 'Somente oportunidade terminal pode ser arquivada.'
    when 'limite-versao' then 'Limite de versão atingido.'
    when 'conflito-transitorio' then 'Operação interrompida; repita o mesmo comando.'
    when 'dado-persistido-invalido' then 'Registro incompatível com o contrato.'
    when 'falha-interna' then 'A operação não foi concluída.'
    else null end;
  if v_mensagem is null then
    v_estado := 'PT500'; p_codigo := 'falha-interna'; p_motivo := null;
    v_mensagem := 'A operação não foi concluída.';
  end if;
  raise exception using errcode = v_estado, message = v_mensagem,
    detail = pg_catalog.jsonb_build_object('contrato','vendas-b2-v1','codigo',p_codigo,'motivo',p_motivo)::text;
end;
$$;

-- Conversão decimal curta: nunca usa float8::text como oráculo ECMAScript.
-- Reconstrói o binary64 exato pelos bits. Inteiros numeric mantêm todos os dígitos.
-- Para cada precisão 1..17, examina floor/ceil e escolhe o decimal roundtrip mais
-- próximo; empate escolhe coeficiente par, conforme Number::toString decimal.
create function private.vendas_b2_numero_js(p_numero double precision)
returns text language plpgsql immutable security invoker set search_path = '' as $$
declare
  b bytea; expo integer; e integer; mant numeric; coef numeric; base integer;
  ordem integer; precisao integer; q integer; den numeric; inferior numeric; resto numeric;
  candidato numeric; escolhido numeric; distancia numeric; melhor numeric; f double precision; i integer;
begin
  if p_numero = 0 then return '0e0'; end if;
  if not (p_numero > 0 and p_numero < 'Infinity'::double precision) then
    perform private.vendas_b2_erro('valor-invalido');
  end if;
  b := pg_catalog.float8send(p_numero);
  expo := ((pg_catalog.get_byte(b,0) & 127) << 4) + (pg_catalog.get_byte(b,1) >> 4);
  mant := pg_catalog.get_byte(b,1) & 15;
  for i in 2..7 loop mant := mant * 256 + pg_catalog.get_byte(b,i); end loop;
  if expo = 0 then e := -1074;
  else mant := mant + 4503599627370496; e := expo - 1023 - 52; end if;
  if e < 0 then coef := mant * pg_catalog.power(5::numeric,-e); base := e;
  else coef := mant * pg_catalog.power(2::numeric,e); base := 0; end if;
  -- power(numeric, 0) pode conservar escala textual; o coeficiente é inteiro.
  coef := pg_catalog.trunc(coef);
  ordem := pg_catalog.length(coef::text) + base - 1;
  for precisao in 1..17 loop
    q := ordem - precisao + 1;
    if base >= q then
      inferior := coef * pg_catalog.power(10::numeric,base-q); den := 1; resto := 0;
    else
      den := pg_catalog.power(10::numeric,q-base);
      inferior := pg_catalog.div(coef,den); resto := pg_catalog.mod(coef,den);
    end if;
    escolhido := null; melhor := null;
    for i in 0..1 loop
      candidato := inferior + i;
      if candidato = 0 then continue; end if;
      begin
        f := (candidato::text || 'e' || q::text)::double precision;
      exception when numeric_value_out_of_range then continue;
      end;
      if f = p_numero then
        distancia := case when i = 0 then resto else den-resto end;
        if melhor is null or distancia < melhor
          or (distancia = melhor and pg_catalog.mod(candidato,2) = 0) then
          escolhido := candidato; melhor := distancia;
        end if;
      end if;
    end loop;
    if escolhido is not null then
      while pg_catalog.mod(escolhido,10) = 0 loop escolhido := escolhido/10; q := q+1; end loop;
      return pg_catalog.trunc(escolhido)::text || 'e' || q::text;
    end if;
  end loop;
  perform private.vendas_b2_erro('valor-invalido');
  return null;
end;
$$;

create function private.vendas_b2_numeric(p_valor jsonb)
returns text language plpgsql immutable security invoker set search_path = '' as $$
declare t text; n numeric; f double precision; canonico text;
begin
  if p_valor is null or p_valor = 'null'::jsonb then return null; end if;
  if pg_catalog.jsonb_typeof(p_valor) <> 'string' then perform private.vendas_b2_erro('valor-invalido'); end if;
  t := p_valor #>> '{}';
  if t !~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$' then
    perform private.vendas_b2_erro('valor-invalido');
  end if;
  begin n := t::numeric; f := t::double precision;
  exception when numeric_value_out_of_range or invalid_text_representation then
    perform private.vendas_b2_erro('valor-invalido');
  end;
  if not (n >= 0 and n < 'Infinity'::numeric) or (n <> 0 and f = 0)
    or not (f >= 0 and f < 'Infinity'::double precision) then
    perform private.vendas_b2_erro('valor-invalido');
  end if;
  canonico := private.vendas_b2_numero_js(f);
  if canonico::numeric <> n then perform private.vendas_b2_erro('valor-invalido'); end if;
  return canonico;
end;
$$;

create function private.vendas_b2_trim(p_texto text)
returns text language sql immutable security invoker set search_path = '' as $$
  select nullif(pg_catalog.btrim(p_texto, pg_catalog.chr(9)||pg_catalog.chr(10)||pg_catalog.chr(11)||pg_catalog.chr(12)||pg_catalog.chr(13)||pg_catalog.chr(32)||pg_catalog.chr(160)||pg_catalog.chr(5760)||pg_catalog.chr(8192)||pg_catalog.chr(8193)||pg_catalog.chr(8194)||pg_catalog.chr(8195)||pg_catalog.chr(8196)||pg_catalog.chr(8197)||pg_catalog.chr(8198)||pg_catalog.chr(8199)||pg_catalog.chr(8200)||pg_catalog.chr(8201)||pg_catalog.chr(8202)||pg_catalog.chr(8232)||pg_catalog.chr(8233)||pg_catalog.chr(8239)||pg_catalog.chr(8287)||pg_catalog.chr(12288)||pg_catalog.chr(65279)), '');
$$;

create function private.vendas_b2_objeto(p_valor jsonb, p_permitidos text[], p_obrigatorios text[], p_erro text default 'estrutura-invalida')
returns void language plpgsql immutable security invoker set search_path = '' as $$
begin
  if pg_catalog.jsonb_typeof(p_valor) is distinct from 'object' then perform private.vendas_b2_erro(p_erro); end if;
  if not (p_valor ?& p_obrigatorios) or exists (
    select 1 from pg_catalog.jsonb_object_keys(p_valor) k where not (k = any(p_permitidos))
  ) then perform private.vendas_b2_erro(p_erro); end if;
end;
$$;

create function private.vendas_b2_texto(p_valor jsonb, p_opcional boolean default false)
returns text language plpgsql immutable security invoker set search_path = '' as $$
begin
  if p_opcional and (p_valor is null or p_valor = 'null'::jsonb) then return null; end if;
  if pg_catalog.jsonb_typeof(p_valor) is distinct from 'string' then perform private.vendas_b2_erro('estrutura-invalida'); end if;
  return p_valor #>> '{}';
end;
$$;

create function private.vendas_b2_uuid(p_valor jsonb)
returns text language plpgsql immutable security invoker set search_path = '' as $$
declare t text := private.vendas_b2_texto(p_valor);
begin
  if t !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    perform private.vendas_b2_erro('estrutura-invalida');
  end if;
  return t::uuid::text;
end;
$$;

create function private.vendas_b2_data(p_texto text)
returns date language plpgsql immutable security invoker set search_path = '' as $$
declare ano integer; mes integer; dia integer; resultado date;
begin
  if p_texto is null or p_texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then perform private.vendas_b2_erro('data-invalida'); end if;
  ano := pg_catalog.substring(p_texto,1,4)::integer;
  mes := pg_catalog.substring(p_texto,6,2)::integer;
  dia := pg_catalog.substring(p_texto,9,2)::integer;
  if ano < 100 or ano > 9999 then perform private.vendas_b2_erro('data-invalida'); end if;
  begin resultado := pg_catalog.make_date(ano,mes,dia);
  exception when datetime_field_overflow then perform private.vendas_b2_erro('data-invalida'); end;
  return resultado;
end;
$$;

create function private.vendas_b2_instante(p_instante timestamptz)
returns text language plpgsql immutable strict security invoker set search_path = '' as $$
begin
  if not pg_catalog.isfinite(p_instante) or extract(year from p_instante at time zone 'UTC') not between 1 and 9999
    or pg_catalog.date_trunc('milliseconds',p_instante,'UTC') <> p_instante then
    perform private.vendas_b2_erro('data-invalida');
  end if;
  return pg_catalog.to_char(p_instante at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
end;
$$;

-- Tipos + comprimentos em bytes + contagem: composição prefix-free, sem objetos.
create function private.vendas_b2_codificar(p_arvore jsonb)
returns bytea language plpgsql immutable security invoker set search_path = '' as $$
declare tipo text := pg_catalog.jsonb_typeof(p_arvore); valor text; bytes bytea; resultado bytea; item jsonb;
begin
  if p_arvore is null or tipo = 'null' then return pg_catalog.convert_to('N','UTF8'); end if;
  if tipo = 'boolean' then return pg_catalog.convert_to(case when p_arvore = 'true'::jsonb then 'T' else 'F' end,'UTF8'); end if;
  if tipo in ('string','number') then
    valor := p_arvore #>> '{}'; bytes := pg_catalog.convert_to(valor,'UTF8');
    return pg_catalog.convert_to(case when tipo = 'string' then 'S' else 'D' end || pg_catalog.octet_length(bytes)::text || ':','UTF8') || bytes;
  end if;
  if tipo = 'array' then
    resultado := pg_catalog.convert_to('A'||pg_catalog.jsonb_array_length(p_arvore)::text||':','UTF8');
    for item in select value from pg_catalog.jsonb_array_elements(p_arvore) loop
      resultado := resultado || private.vendas_b2_codificar(item);
    end loop;
    return resultado;
  end if;
  perform private.vendas_b2_erro('estrutura-invalida'); return null;
end;
$$;

create function private.vendas_b2_normalizar(p_porta text, p_comando jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare
  obrigatorios text[]; permitidos text[]; c jsonb; imovel jsonb; origem jsonb; modo text; campo text;
  versao numeric; argumentos jsonb; ti jsonb := 'null'::jsonb; to_ jsonb := 'null'::jsonb;
  previsto jsonb; receita jsonb; fechado jsonb;
begin
  obrigatorios := array['chaveIdempotencia'];
  if p_porta <> 'criar' then obrigatorios := obrigatorios || array['oportunidadeId','versaoEsperada']; end if;
  permitidos := obrigatorios;
  case p_porta
    when 'criar' then obrigatorios := obrigatorios || array['contatoId']; permitidos := permitidos || array['contatoId','imovelTratado','origem','valorNegocioPrevisto','receitaPrevista'];
    when 'transicionar' then obrigatorios := obrigatorios || array['destino']; permitidos := permitidos || array['destino'];
    when 'alterar_imovel' then obrigatorios := obrigatorios || array['imovelTratado']; permitidos := permitidos || array['imovelTratado'];
    when 'alterar_valores' then obrigatorios := obrigatorios || array['valorNegocioPrevisto','receitaPrevista']; permitidos := permitidos || array['valorNegocioPrevisto','receitaPrevista'];
    when 'ganhar' then obrigatorios := obrigatorios || array['confirmacaoExplicita','dataFato','registroFormalizacao']; permitidos := permitidos || array['confirmacaoExplicita','dataFato','registroFormalizacao','valorNegocioFechado'];
    when 'perder' then obrigatorios := obrigatorios || array['dataFato','motivo']; permitidos := permitidos || array['dataFato','motivo','justificativa'];
    when 'arquivar' then null;
    else perform private.vendas_b2_erro('estrutura-invalida');
  end case;
  if p_porta in ('criar','alterar_valores') and p_comando ? 'valorNegocioFechado' then perform private.vendas_b2_erro('valor-fechado-incompativel'); end if;
  perform private.vendas_b2_objeto(p_comando,permitidos,obrigatorios);
  c := pg_catalog.jsonb_build_object('chaveIdempotencia',private.vendas_b2_texto(p_comando->'chaveIdempotencia'));
  if p_porta <> 'criar' then
    if pg_catalog.jsonb_typeof(p_comando->'versaoEsperada') is distinct from 'number' then perform private.vendas_b2_erro('versao-invalida'); end if;
    versao := (p_comando->>'versaoEsperada')::numeric;
    if versao < 1 or versao > 9007199254740991 or versao <> pg_catalog.trunc(versao) then perform private.vendas_b2_erro('versao-invalida'); end if;
    c := c || pg_catalog.jsonb_build_object('oportunidadeId',private.vendas_b2_uuid(p_comando->'oportunidadeId'),'versaoEsperada',versao::bigint);
  end if;
  if p_porta = 'criar' then c := c || pg_catalog.jsonb_build_object('contatoId',private.vendas_b2_uuid(p_comando->'contatoId')); end if;
  if p_porta in ('criar','alterar_imovel') then
    imovel := p_comando->'imovelTratado';
    if imovel is null or imovel = 'null'::jsonb then imovel := 'null'::jsonb;
    else
      if pg_catalog.jsonb_typeof(imovel) is distinct from 'object' then perform private.vendas_b2_erro('modo-imovel-invalido'); end if;
      modo := imovel->>'modo';
      if modo = 'referencia' then
        perform private.vendas_b2_objeto(imovel,array['modo','imovelId'],array['modo','imovelId'],'modo-imovel-invalido');
        imovel := pg_catalog.jsonb_build_object('modo','referencia','imovelId',private.vendas_b2_uuid(imovel->'imovelId'));
        ti := pg_catalog.jsonb_build_array('referencia',imovel->'imovelId');
      elsif modo = 'manual' then
        perform private.vendas_b2_objeto(imovel,array['modo','endereco','referencia','unidade','bloco','descricaoCurta'],array['modo'],'modo-imovel-invalido');
        imovel := pg_catalog.jsonb_build_object('modo','manual',
          'endereco',private.vendas_b2_trim(private.vendas_b2_texto(imovel->'endereco',true)),
          'referencia',private.vendas_b2_trim(private.vendas_b2_texto(imovel->'referencia',true)),
          'unidade',private.vendas_b2_trim(private.vendas_b2_texto(imovel->'unidade',true)),
          'bloco',private.vendas_b2_trim(private.vendas_b2_texto(imovel->'bloco',true)),
          'descricaoCurta',private.vendas_b2_trim(private.vendas_b2_texto(imovel->'descricaoCurta',true)));
        ti := pg_catalog.jsonb_build_array('manual',imovel->'endereco',imovel->'referencia',imovel->'unidade',imovel->'bloco',imovel->'descricaoCurta');
      else perform private.vendas_b2_erro('modo-imovel-invalido'); end if;
    end if;
    c := c || pg_catalog.jsonb_build_object('imovelTratado',imovel);
  end if;
  if p_porta = 'criar' then
    origem := p_comando->'origem';
    if origem is null or origem = 'null'::jsonb then origem := 'null'::jsonb;
    else
      perform private.vendas_b2_objeto(origem,array['tipo','descricao'],array['tipo'],'origem-invalida');
      if pg_catalog.jsonb_typeof(origem->'tipo') is distinct from 'string' or not (origem->>'tipo' = any(array['indicacao','portal','whatsapp','telefone','formulario','atendimento_presencial','outro'])) then perform private.vendas_b2_erro('origem-invalida'); end if;
      origem := pg_catalog.jsonb_build_object('tipo',origem->>'tipo','descricao',private.vendas_b2_trim(private.vendas_b2_texto(origem->'descricao',true)));
      to_ := pg_catalog.jsonb_build_array(origem->'tipo',origem->'descricao');
    end if;
    c := c || pg_catalog.jsonb_build_object('origem',origem);
  end if;
  if p_porta in ('criar','alterar_valores') then
    c := c || pg_catalog.jsonb_build_object('valorNegocioPrevisto',private.vendas_b2_numeric(p_comando->'valorNegocioPrevisto'),'receitaPrevista',private.vendas_b2_numeric(p_comando->'receitaPrevista'));
  end if;
  if p_porta = 'transicionar' then c := c || pg_catalog.jsonb_build_object('destino',private.vendas_b2_texto(p_comando->'destino')); end if;
  if p_porta in ('ganhar','perder') then
    campo := private.vendas_b2_texto(p_comando->'dataFato'); perform private.vendas_b2_data(campo);
    c := c || pg_catalog.jsonb_build_object('dataFato',campo);
  end if;
  if p_porta = 'ganhar' then
    if pg_catalog.jsonb_typeof(p_comando->'confirmacaoExplicita') is distinct from 'boolean' then perform private.vendas_b2_erro('ganho-invalido','confirmacao-obrigatoria'); end if;
    c := c || pg_catalog.jsonb_build_object('confirmacaoExplicita',p_comando->'confirmacaoExplicita',
      'registroFormalizacao',private.vendas_b2_trim(private.vendas_b2_texto(p_comando->'registroFormalizacao')),
      'valorNegocioFechado',private.vendas_b2_numeric(p_comando->'valorNegocioFechado'));
  elsif p_porta = 'perder' then
    c := c || pg_catalog.jsonb_build_object('motivo',private.vendas_b2_texto(p_comando->'motivo'),
      'justificativa',private.vendas_b2_trim(private.vendas_b2_texto(p_comando->'justificativa',true)));
  end if;
  -- Valores tipados dentro das tuplas: decimal textual não vira string comercial.
  previsto := case when c->>'valorNegocioPrevisto' is null then 'null'::jsonb else pg_catalog.jsonb_build_array('numeric',c->'valorNegocioPrevisto') end;
  receita := case when c->>'receitaPrevista' is null then 'null'::jsonb else pg_catalog.jsonb_build_array('numeric',c->'receitaPrevista') end;
  fechado := case when c->>'valorNegocioFechado' is null then 'null'::jsonb else pg_catalog.jsonb_build_array('numeric',c->'valorNegocioFechado') end;
  argumentos := case p_porta
    when 'criar' then pg_catalog.jsonb_build_array(c->'contatoId',ti,to_,previsto,receita)
    when 'transicionar' then pg_catalog.jsonb_build_array(c->'destino')
    when 'alterar_imovel' then pg_catalog.jsonb_build_array(ti)
    when 'alterar_valores' then pg_catalog.jsonb_build_array(previsto,receita)
    when 'ganhar' then pg_catalog.jsonb_build_array(c->'confirmacaoExplicita',c->'dataFato',c->'registroFormalizacao',fechado)
    when 'perder' then pg_catalog.jsonb_build_array(c->'dataFato',c->'motivo',c->'justificativa')
    else '[]'::jsonb end;
  return pg_catalog.jsonb_build_object('comando',c,'argumentos',argumentos);
end;
$$;

create function private.vendas_b2_fingerprint(p_usuario uuid, p_porta text, p_normalizado jsonb)
returns text language sql immutable security invoker set search_path = '' as $$
  select pg_catalog.encode(pg_catalog.sha256(private.vendas_b2_codificar(pg_catalog.jsonb_build_array(
    'vendas-b2-fingerprint-1',p_usuario::text,p_normalizado->'comando'->'chaveIdempotencia',p_porta,
    p_normalizado->'comando'->'oportunidadeId',p_normalizado->'comando'->'versaoEsperada',p_normalizado->'argumentos'
  ))),'hex');
$$;

create function private.vendas_b2_snapshot(p_linha public.vendas_oportunidades)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare imovel jsonb := 'null'::jsonb; encerramento jsonb := 'null'::jsonb; original uuid;
begin
  if p_linha.imovel_modo = 'referencia' then
    select r.imovel_id_original into original from public.vendas_imoveis_referencias r
      where r.id = p_linha.imovel_referencia_id and r.user_id = p_linha.user_id;
    if not found then perform private.vendas_b2_erro('dado-persistido-invalido'); end if;
    imovel := pg_catalog.jsonb_build_object('modo','referencia','imovelId',original::text);
  elsif p_linha.imovel_modo = 'manual' then
    imovel := pg_catalog.jsonb_build_object('modo','manual','endereco',private.vendas_b2_trim(p_linha.manual_endereco),
      'referencia',private.vendas_b2_trim(p_linha.manual_referencia),'unidade',private.vendas_b2_trim(p_linha.manual_unidade),
      'bloco',private.vendas_b2_trim(p_linha.manual_bloco),'descricaoCurta',private.vendas_b2_trim(p_linha.manual_descricao_curta));
  end if;
  if p_linha.data_fato > (p_linha.updated_at at time zone 'America/Sao_Paulo')::date then
    perform private.vendas_b2_erro('dado-persistido-invalido');
  end if;
  if p_linha.estado = 'ganha' then
    encerramento := pg_catalog.jsonb_build_object('tipo','ganho','confirmacaoExplicita',true,
      'dataFato',pg_catalog.to_char(p_linha.data_fato,'YYYY-MM-DD'),'registroFormalizacao',private.vendas_b2_trim(p_linha.registro_formalizacao));
  elsif p_linha.estado = 'perdida' then
    encerramento := pg_catalog.jsonb_build_object('tipo','perda','dataFato',pg_catalog.to_char(p_linha.data_fato,'YYYY-MM-DD'),
      'motivo',p_linha.motivo_perda,'justificativa',private.vendas_b2_trim(p_linha.justificativa_perda));
  end if;
  return pg_catalog.jsonb_build_object(
    'id',p_linha.id::text,'userId',p_linha.user_id::text,'contatoId',p_linha.contato_id::text,
    'criadoPor',p_linha.criado_por::text,'responsavelUsuarioId',p_linha.responsavel_usuario_id::text,
    'estado',p_linha.estado,'versao',p_linha.versao::text,'imovelTratado',imovel,
    'origem',case when p_linha.origem_tipo is null then 'null'::jsonb else pg_catalog.jsonb_build_object('tipo',p_linha.origem_tipo,'descricao',private.vendas_b2_trim(p_linha.origem_descricao)) end,
    'valores',pg_catalog.jsonb_build_object(
      'valorNegocioPrevisto',private.vendas_b2_numeric(pg_catalog.to_jsonb(p_linha.valor_negocio_previsto::text)),
      'valorNegocioFechado',private.vendas_b2_numeric(pg_catalog.to_jsonb(p_linha.valor_negocio_fechado::text)),
      'receitaPrevista',private.vendas_b2_numeric(pg_catalog.to_jsonb(p_linha.receita_prevista::text))),
    'encerramento',encerramento,'encerradoEm',private.vendas_b2_instante(p_linha.encerrado_em),
    'criadoEm',private.vendas_b2_instante(p_linha.created_at),'atualizadoEm',private.vendas_b2_instante(p_linha.updated_at),
    'arquivadaEm',private.vendas_b2_instante(p_linha.arquivado_em));
exception when sqlstate 'PT422' then perform private.vendas_b2_erro('dado-persistido-invalido'); return null;
end;
$$;

-- Único executor interno. Não tem autoridade administrativa genérica nem ACL de cliente.
create function private.vendas_b2_executar(p_porta text, p_comando jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  usuario uuid := (select auth.uid()); chave text; normalizado jsonb; c jsonb; hash text;
  recibo private.vendas_comandos%rowtype; anterior public.vendas_oportunidades%rowtype;
  atual public.vendas_oportunidades%rowtype; retrato_anterior jsonb; retrato jsonb;
  imovel jsonb; vivo record; capturar boolean := false; instante timestamptz; sem_mudanca boolean := false;
  evento_id uuid; tipo_evento text; dados jsonb; evento jsonb := 'null'::jsonb; resposta jsonb;
  linhas integer; fato date; operacao text; referencia uuid;
begin
  if usuario is null then perform private.vendas_b2_erro('nao-autenticado'); end if;
  perform 1 from auth.users u where u.id = usuario for key share;
  if not found then perform private.vendas_b2_erro('nao-autenticado'); end if;
  if pg_catalog.jsonb_typeof(p_comando) is distinct from 'object' then perform private.vendas_b2_erro('estrutura-invalida'); end if;
  chave := private.vendas_b2_texto(p_comando->'chaveIdempotencia');
  if not private.vendas_texto_util(chave) then perform private.vendas_b2_erro('estrutura-invalida'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.encode(
    private.vendas_b2_codificar(pg_catalog.jsonb_build_array('vendas-b2-lock-1',usuario::text,chave)),'hex'),0));
  select * into recibo from private.vendas_comandos r where r.user_id = usuario and r.chave_idempotencia = chave;
  begin
    normalizado := private.vendas_b2_normalizar(p_porta,p_comando);
    hash := private.vendas_b2_fingerprint(usuario,p_porta,normalizado);
  exception when sqlstate 'PT422' then
    if recibo.id is not null then perform private.vendas_b2_erro('chave-idempotencia-conflitante'); end if;
    raise;
  end;
  if recibo.id is not null then
    if recibo.fingerprint <> hash then perform private.vendas_b2_erro('chave-idempotencia-conflitante'); end if;
    return recibo.resposta;
  end if;
  c := normalizado->'comando';
  if p_porta = 'criar' then
    perform 1 from public.contatos t where t.id = (c->>'contatoId')::uuid and t.user_id = usuario for key share;
    if not found then perform private.vendas_b2_erro('contato-invalido'); end if;
    atual.id := pg_catalog.gen_random_uuid(); atual.user_id := usuario; atual.contato_id := (c->>'contatoId')::uuid;
    atual.criado_por := usuario; atual.responsavel_usuario_id := usuario; atual.estado := 'nova'; atual.versao := 1;
    atual.origem_tipo := c->'origem'->>'tipo'; atual.origem_descricao := c->'origem'->>'descricao';
    atual.valor_negocio_previsto := (c->>'valorNegocioPrevisto')::numeric;
    atual.receita_prevista := (c->>'receitaPrevista')::numeric;
    tipo_evento := 'oportunidade_criada'; operacao := 'criar';
  else
    select * into anterior from public.vendas_oportunidades o
      where o.id = (c->>'oportunidadeId')::uuid and o.user_id = usuario for update;
    if not found then perform private.vendas_b2_erro('nao-encontrado'); end if;
    retrato_anterior := private.vendas_b2_snapshot(anterior);
    if anterior.versao = 9007199254740991 then perform private.vendas_b2_erro('limite-versao'); end if;
    if anterior.versao <> (c->>'versaoEsperada')::bigint then perform private.vendas_b2_erro('versao-conflitante'); end if;
    atual := anterior;
    if p_porta <> 'arquivar' then
      if anterior.arquivado_em is not null then perform private.vendas_b2_erro('oportunidade-arquivada'); end if;
      if anterior.estado in ('ganha','perdida') then
        if p_porta = 'transicionar' or p_porta in ('ganhar','perder') then perform private.vendas_b2_erro('transicao-invalida'); end if;
        perform private.vendas_b2_erro('estado-terminal');
      end if;
    end if;
    case p_porta
      when 'transicionar' then
        if not ((anterior.estado = 'nova' and c->>'destino' = 'em_atendimento')
          or (anterior.estado = 'em_atendimento' and c->>'destino' = 'em_negociacao')) then perform private.vendas_b2_erro('transicao-invalida'); end if;
        if c->>'destino' = 'em_negociacao' and atual.imovel_modo is null then perform private.vendas_b2_erro('imovel-obrigatorio'); end if;
        atual.estado := c->>'destino'; tipo_evento := 'etapa_alterada'; operacao := 'transicionar';
      when 'alterar_imovel' then
        tipo_evento := 'imovel_alterado'; operacao := 'alterar_imovel';
        if anterior.estado = 'em_negociacao' and c->'imovelTratado' = 'null'::jsonb then perform private.vendas_b2_erro('imovel-obrigatorio'); end if;
        sem_mudanca := retrato_anterior->'imovelTratado' = c->'imovelTratado';
      when 'alterar_valores' then
        atual.valor_negocio_previsto := (c->>'valorNegocioPrevisto')::numeric; atual.receita_prevista := (c->>'receitaPrevista')::numeric;
        sem_mudanca := atual.valor_negocio_previsto is not distinct from anterior.valor_negocio_previsto
          and atual.receita_prevista is not distinct from anterior.receita_prevista;
        tipo_evento := 'valor_alterado'; operacao := 'alterar_valores';
      when 'ganhar' then
        if anterior.estado <> 'em_negociacao' then perform private.vendas_b2_erro('transicao-invalida'); end if;
        if atual.imovel_modo is null then perform private.vendas_b2_erro('imovel-obrigatorio'); end if;
        if c->'confirmacaoExplicita' <> 'true'::jsonb then perform private.vendas_b2_erro('ganho-invalido','confirmacao-obrigatoria'); end if;
        if c->>'registroFormalizacao' is null then perform private.vendas_b2_erro('ganho-invalido','formalizacao-obrigatoria'); end if;
        atual.estado := 'ganha'; atual.encerramento_tipo := 'ganho'; atual.confirmacao_explicita := true;
        atual.registro_formalizacao := c->>'registroFormalizacao'; atual.valor_negocio_fechado := (c->>'valorNegocioFechado')::numeric;
        atual.motivo_perda := null; atual.justificativa_perda := null;
        tipo_evento := 'oportunidade_ganha'; operacao := 'transicionar';
      when 'perder' then
        if not (c->>'motivo' = any(array['desistencia_interessado','condicoes_incompativeis','imovel_indisponivel','compra_outro_canal','outro'])) then perform private.vendas_b2_erro('perda-invalida','motivo-perda-invalido'); end if;
        if c->>'motivo' = 'outro' and c->>'justificativa' is null then perform private.vendas_b2_erro('perda-invalida','justificativa-obrigatoria'); end if;
        atual.estado := 'perdida'; atual.encerramento_tipo := 'perda'; atual.motivo_perda := c->>'motivo'; atual.justificativa_perda := c->>'justificativa';
        atual.confirmacao_explicita := null; atual.registro_formalizacao := null; atual.valor_negocio_fechado := null;
        tipo_evento := 'oportunidade_perdida'; operacao := 'transicionar';
      when 'arquivar' then
        if anterior.estado not in ('ganha','perdida') then perform private.vendas_b2_erro('arquivamento-invalido'); end if;
        sem_mudanca := anterior.arquivado_em is not null; tipo_evento := 'oportunidade_arquivada'; operacao := 'arquivar';
      else perform private.vendas_b2_erro('estrutura-invalida');
    end case;
  end if;
  -- Captura somente em uma seleção efetiva; igualdade histórica não exige ponteiro vivo.
  if p_porta in ('criar','alterar_imovel') then
    imovel := c->'imovelTratado';
    if imovel->>'modo' = 'manual' and imovel->>'endereco' is null and imovel->>'referencia' is null then perform private.vendas_b2_erro('modo-imovel-invalido'); end if;
    if not sem_mudanca and imovel->>'modo' = 'referencia' then
      select i.id,i.codigo,i.referencia_crm,i.endereco,i.unidade,i.bloco into vivo
        from public.imoveis i where i.id = (imovel->>'imovelId')::uuid and i.user_id = usuario for share;
      if not found then perform private.vendas_b2_erro('imovel-invalido'); end if;
      capturar := true;
    end if;
  end if;
  instante := pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp(),'UTC');
  perform private.vendas_b2_instante(instante);
  if anterior.id is not null and instante < anterior.updated_at then perform private.vendas_b2_erro('data-invalida'); end if;
  if p_porta in ('ganhar','perder') then
    fato := private.vendas_b2_data(c->>'dataFato');
    if fato > (instante at time zone 'America/Sao_Paulo')::date then perform private.vendas_b2_erro('data-futura'); end if;
    atual.data_fato := fato; atual.encerrado_em := instante;
  end if;
  if capturar then
    referencia := pg_catalog.gen_random_uuid();
    insert into public.vendas_imoveis_referencias(id,user_id,imovel_id,imovel_id_original,codigo,referencia,endereco,unidade,bloco,capturado_em)
      values(referencia,usuario,vivo.id,vivo.id,vivo.codigo,vivo.referencia_crm,vivo.endereco,vivo.unidade,vivo.bloco,instante);
  end if;
  if p_porta in ('criar','alterar_imovel') and not sem_mudanca then
    atual.imovel_modo := imovel->>'modo'; atual.imovel_referencia_id := referencia;
    atual.manual_endereco := imovel->>'endereco'; atual.manual_referencia := imovel->>'referencia';
    atual.manual_unidade := imovel->>'unidade'; atual.manual_bloco := imovel->>'bloco'; atual.manual_descricao_curta := imovel->>'descricaoCurta';
  end if;
  if not sem_mudanca then
    atual.updated_at := instante;
    if p_porta = 'criar' then
      atual.created_at := instante;
      insert into public.vendas_oportunidades select (atual).* returning * into atual;
    else
      atual.versao := anterior.versao + 1;
      if p_porta = 'arquivar' then atual.arquivado_em := instante; end if;
      update public.vendas_oportunidades o set
        estado=atual.estado,versao=atual.versao,imovel_modo=atual.imovel_modo,imovel_referencia_id=atual.imovel_referencia_id,
        manual_endereco=atual.manual_endereco,manual_referencia=atual.manual_referencia,manual_unidade=atual.manual_unidade,
        manual_bloco=atual.manual_bloco,manual_descricao_curta=atual.manual_descricao_curta,
        valor_negocio_previsto=atual.valor_negocio_previsto,valor_negocio_fechado=atual.valor_negocio_fechado,receita_prevista=atual.receita_prevista,
        encerramento_tipo=atual.encerramento_tipo,data_fato=atual.data_fato,confirmacao_explicita=atual.confirmacao_explicita,
        registro_formalizacao=atual.registro_formalizacao,motivo_perda=atual.motivo_perda,justificativa_perda=atual.justificativa_perda,
        encerrado_em=atual.encerrado_em,arquivado_em=atual.arquivado_em,updated_at=atual.updated_at
        where o.id=anterior.id and o.user_id=usuario and o.versao=anterior.versao returning o.* into atual;
      get diagnostics linhas = row_count;
      if linhas <> 1 then perform private.vendas_b2_erro('versao-conflitante'); end if;
    end if;
    retrato := private.vendas_b2_snapshot(atual);
    dados := case tipo_evento
      when 'oportunidade_criada' then pg_catalog.jsonb_build_object('contatoId',retrato->'contatoId','imovelTratado',retrato->'imovelTratado','origem',retrato->'origem','valores',retrato->'valores')
      when 'etapa_alterada' then pg_catalog.jsonb_build_object('anterior',anterior.estado,'atual',atual.estado)
      when 'imovel_alterado' then pg_catalog.jsonb_build_object('anterior',retrato_anterior->'imovelTratado','atual',retrato->'imovelTratado')
      when 'valor_alterado' then pg_catalog.jsonb_build_object('anterior',retrato_anterior->'valores','atual',retrato->'valores')
      when 'oportunidade_ganha' then pg_catalog.jsonb_build_object('anterior',anterior.estado,'encerramento',retrato->'encerramento','valorNegocioFechado',retrato->'valores'->'valorNegocioFechado')
      when 'oportunidade_perdida' then pg_catalog.jsonb_build_object('anterior',anterior.estado,'encerramento',retrato->'encerramento')
      else pg_catalog.jsonb_build_object('estado',anterior.estado) end;
    evento_id := pg_catalog.gen_random_uuid();
    insert into public.vendas_oportunidades_eventos(id,user_id,oportunidade_id,tipo,ator_usuario_id,registrado_em,data_fato,versao,payload,chave_idempotencia)
      values(evento_id,usuario,atual.id,tipo_evento,usuario,instante,fato,atual.versao,
        pg_catalog.jsonb_build_object('versaoContrato',1,'dados',dados),chave);
    evento := pg_catalog.jsonb_build_object('id',evento_id::text,'userId',usuario::text,'oportunidadeId',atual.id::text,
      'tipo',tipo_evento,'atorUsuarioId',usuario::text,'registradoEm',private.vendas_b2_instante(instante),
      'dataFato',case when fato is null then null else pg_catalog.to_char(fato,'YYYY-MM-DD') end,
      'versao',atual.versao::text,'chaveIdempotencia',chave,'versaoContrato',1,'dados',dados);
  else retrato := retrato_anterior; end if;
  resposta := pg_catalog.jsonb_build_object('contrato','vendas-b2-v1','ok',true,'oportunidade',retrato,'evento',evento,'noOp',sem_mudanca);
  insert into private.vendas_comandos(id,user_id,chave_idempotencia,operacao,fingerprint,oportunidade_id,evento_id,resposta,created_at,concluido_em)
    values(pg_catalog.gen_random_uuid(),usuario,chave,operacao,hash,atual.id,evento_id,resposta,instante,instante);
  return resposta;
exception
  when deadlock_detected or serialization_failure or lock_not_available then perform private.vendas_b2_erro('conflito-transitorio'); return null;
  when others then
    if sqlstate in ('PT401','PT404','PT409','PT422','PT500','PT503') then raise; end if;
    perform private.vendas_b2_erro('falha-interna'); return null;
end;
$$;

create function public.vendas_criar_oportunidade(p_comando jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.vendas_b2_executar('criar',p_comando); $$;
create function public.vendas_transicionar_oportunidade(p_comando jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.vendas_b2_executar('transicionar',p_comando); $$;
create function public.vendas_alterar_imovel(p_comando jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.vendas_b2_executar('alterar_imovel',p_comando); $$;
create function public.vendas_alterar_valores(p_comando jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.vendas_b2_executar('alterar_valores',p_comando); $$;
create function public.vendas_ganhar_oportunidade(p_comando jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.vendas_b2_executar('ganhar',p_comando); $$;
create function public.vendas_perder_oportunidade(p_comando jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.vendas_b2_executar('perder',p_comando); $$;
create function public.vendas_arquivar_oportunidade(p_comando jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$ select private.vendas_b2_executar('arquivar',p_comando); $$;

alter function private.vendas_b2_trim(text) owner to postgres;
alter function private.vendas_b2_objeto(jsonb,text[],text[],text) owner to postgres;
alter function private.vendas_b2_texto(jsonb,boolean) owner to postgres;
alter function private.vendas_b2_uuid(jsonb) owner to postgres;
alter function private.vendas_b2_data(text) owner to postgres;
alter function private.vendas_b2_instante(timestamptz) owner to postgres;
alter function private.vendas_b2_codificar(jsonb) owner to postgres;
alter function private.vendas_b2_normalizar(text,jsonb) owner to postgres;
alter function private.vendas_b2_fingerprint(uuid,text,jsonb) owner to postgres;
alter function private.vendas_b2_snapshot(public.vendas_oportunidades) owner to postgres;
alter function private.vendas_b2_executar(text,jsonb) owner to postgres;
revoke all on function private.vendas_b2_trim(text), private.vendas_b2_objeto(jsonb,text[],text[],text),
  private.vendas_b2_texto(jsonb,boolean),private.vendas_b2_uuid(jsonb),private.vendas_b2_data(text),
  private.vendas_b2_instante(timestamptz),private.vendas_b2_codificar(jsonb),private.vendas_b2_normalizar(text,jsonb),
  private.vendas_b2_fingerprint(uuid,text,jsonb),private.vendas_b2_snapshot(public.vendas_oportunidades),private.vendas_b2_executar(text,jsonb)
  from public,anon,authenticated,service_role;

alter function public.vendas_criar_oportunidade(jsonb) owner to postgres;
alter function public.vendas_transicionar_oportunidade(jsonb) owner to postgres;
alter function public.vendas_alterar_imovel(jsonb) owner to postgres;
alter function public.vendas_alterar_valores(jsonb) owner to postgres;
alter function public.vendas_ganhar_oportunidade(jsonb) owner to postgres;
alter function public.vendas_perder_oportunidade(jsonb) owner to postgres;
alter function public.vendas_arquivar_oportunidade(jsonb) owner to postgres;
revoke all on function public.vendas_criar_oportunidade(jsonb),public.vendas_transicionar_oportunidade(jsonb),
  public.vendas_alterar_imovel(jsonb),public.vendas_alterar_valores(jsonb),public.vendas_ganhar_oportunidade(jsonb),
  public.vendas_perder_oportunidade(jsonb),public.vendas_arquivar_oportunidade(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.vendas_criar_oportunidade(jsonb),public.vendas_transicionar_oportunidade(jsonb),
  public.vendas_alterar_imovel(jsonb),public.vendas_alterar_valores(jsonb),public.vendas_ganhar_oportunidade(jsonb),
  public.vendas_perder_oportunidade(jsonb),public.vendas_arquivar_oportunidade(jsonb) to authenticated;

alter function private.vendas_b2_erro(text,text) owner to postgres;
alter function private.vendas_b2_numero_js(double precision) owner to postgres;
alter function private.vendas_b2_numeric(jsonb) owner to postgres;
revoke all on function private.vendas_b2_erro(text,text), private.vendas_b2_numero_js(double precision),
  private.vendas_b2_numeric(jsonb) from public, anon, authenticated, service_role;
commit;
-- END VENDAS V1-B2
