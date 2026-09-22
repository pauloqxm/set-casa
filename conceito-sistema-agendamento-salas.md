# Sistema de Agendamento de Salas

## 1. Contexto

Hoje o controle de agendamento de salas é feito em uma planilha (Excel), com uma aba por mês e um bloco de colunas para cada sala. Cada bloco mostra o horário do dia (8h às 12h e 13h às 17h), com um checkbox marcando se o horário está ocupado, além de campos de coordenação responsável, nome do responsável e observação.

Esse modelo funciona, mas tem limitações claras:

- Não impede conflito de horário automaticamente, depende de atenção de quem preenche.
- Não tem controle de acesso, qualquer pessoa com o arquivo pode editar qualquer célula.
- Fica difícil consultar de forma rápida "quais salas estão livres agora" ou "histórico de uso por coordenação".
- Não escala bem para novas salas ou novos setores sem reformatar a planilha inteira.

A proposta é transformar essa lógica em um sistema web, com banco de dados relacional, login com senha e regras de acesso por perfil.

## 2. Objetivos do sistema

- Permitir que qualquer coordenação veja a agenda de todas as salas em tempo real.
- Impedir agendamentos sobrepostos na mesma sala e horário.
- Restringir quem pode marcar, editar e cancelar agendamentos, com base em login e perfil.
- Manter histórico completo (igual às abas antigas da planilha: Nov24, fev25, mar25 etc).
- Servir como base para um produto reaproveitável em outras secretarias ou instituições (white label).

## 3. Entidades principais

**Salas**
Nome, andar, capacidade, recursos disponíveis (projetor, TV, videoconferência), status ativo/inativo.

**Coordenações/Setores**
Sigla e nome completo. Existir como tabela própria evita variações de texto livre como "ASCOI", "Ascoi", "ascoi" sendo tratadas como coisas diferentes.

**Usuários**
Nome, e-mail, senha (hash), coordenação vinculada, papel (admin ou usuário comum).

**Agendamentos**
Sala, usuário que fez o agendamento, coordenação, responsável, observação, data, hora início, hora fim, status (confirmado ou cancelado).

## 4. Modelo de banco de dados

Banco relacional (Postgres, funciona diretamente no Supabase).

```sql
create table salas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  andar text,
  capacidade int,
  recursos text[], -- ex: {'projetor','tv','videoconferencia'}
  ativo boolean default true
);

create table coordenacoes (
  id uuid primary key default gen_random_uuid(),
  sigla text not null unique,
  nome_completo text
);

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text unique not null,
  senha_hash text not null,
  coordenacao_id uuid references coordenacoes(id),
  papel text not null default 'usuario' check (papel in ('admin','usuario')),
  criado_em timestamptz default now()
);

create table agendamentos (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid references salas(id) not null,
  usuario_id uuid references usuarios(id) not null,
  coordenacao_id uuid references coordenacoes(id),
  responsavel text not null,
  observacao text,
  data date not null,
  hora_inicio time not null,
  hora_fim time not null,
  status text not null default 'confirmado' check (status in ('confirmado','cancelado')),
  criado_em timestamptz default now(),

  constraint horario_valido check (hora_fim > hora_inicio)
);

-- impede dois agendamentos confirmados na mesma sala com horario sobreposto
create extension if not exists btree_gist;
alter table agendamentos add constraint sem_conflito
  exclude using gist (
    sala_id with =,
    daterange(data, data, '[]') with &&,
    tsrange(data + hora_inicio, data + hora_fim) with &&
  ) where (status = 'confirmado');
```

A constraint `sem_conflito` faz o banco recusar automaticamente qualquer tentativa de agendamento que bata em cima de outro já confirmado na mesma sala. Isso tira da aplicação a responsabilidade de checar conflito na mão.

## 5. Autenticação e controle de acesso

Login por e-mail e senha (Supabase Auth cobre hash de senha, recuperação de senha e confirmação por e-mail sem precisar construir do zero).

Regras de acesso (Row Level Security):

- Qualquer usuário logado pode visualizar todos os agendamentos de todas as salas, já que o ponto principal do sistema é dar visibilidade da agenda geral.
- Um usuário comum só pode criar, editar ou cancelar agendamentos da própria coordenação.
- O perfil admin tem acesso total: cadastro de salas, coordenações, usuários e qualquer agendamento.

## 6. Funcionalidades da interface

1. **Agenda por sala**, em formato de grade semanal ou mensal (equivalente visual à planilha atual, só que clicável em vez de checkbox manual).
2. **Novo agendamento**: escolha de sala, data e horário, com os horários já ocupados aparecendo bloqueados na hora de marcar.
3. **Painel administrativo**: cadastro e edição de salas, coordenações e usuários, além de relatórios simples (sala mais usada, coordenação que mais agenda, taxa de ocupação por horário).
4. **Notificações opcionais**: aviso por e-mail ou WhatsApp quando um agendamento é confirmado ou cancelado.
5. **Histórico**: consulta de meses anteriores, mantendo o mesmo tipo de registro que hoje fica espalhado em abas separadas da planilha.

## 7. Stack sugerida

- **Frontend**: Next.js, com a grade de horários como componente central.
- **Backend/Banco**: Supabase (Postgres, Auth e API prontos).
- **Hospedagem**: Vercel para o frontend, Supabase cuidando do banco e autenticação.

## 8. Fases sugeridas de construção

1. Estrutura de banco (tabelas acima) e login básico.
2. Tela de agenda em modo leitura (visualizar ocupação de todas as salas).
3. Formulário de agendamento com bloqueio de conflito.
4. Painel admin (salas, coordenações, usuários).
5. Relatórios e notificações.

## 9. Potencial de reaproveitamento

A mesma estrutura serve como produto white label para outras secretarias ou instituições que hoje controlam salas por planilha, seguindo a mesma lógica já aplicada em outros sistemas construídos anteriormente (multi-tenant, um cliente por instância ou por schema).
