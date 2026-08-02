# YieGo Project Transcript Overview

## Context

This project is being continued from an existing Lovable/GitHub codebase. The current app is a polished frontend prototype for YieGo, a Ghana-focused digital services platform. The immediate goal is to understand the current state, then plan and build the real production features in phases.

## Product Overview From Stakeholder

YieGo is primarily a platform for selling mobile data in Ghana.

The first and most important goal is to let normal customers come to the website, choose a data bundle, pay, and receive data successfully. This direct data-selling flow is the foundation of the product.

The secondary goal is an agent system.

Agents are people who create stores under YieGo and sell data to their own audience. YieGo sets a base price for agents, and agents set their own selling prices so they can make profit.

There are two main agent levels planned:

- Pro agents
- Basic agents

Pro agents are direct agents under YieGo. YieGo sets pricing for them. They can create their own storefronts, set their own selling prices, and sell data to traffic they bring from their own audience.

Basic agents are agents under pro agents. Pro agents recruit or approve these basic agents and set pricing for them. Basic agents can also have their own storefronts and sell data to their customers. They do not pay YieGo directly because they are connected under pro agents.

Pro agents are expected to pay a monthly subscription fee of about $5 for access to their storefront and agent tools.

The basic agents do not pay a subscription fee because they operate under pro agents while still using the YieGo platform.

The agent system can become a major revenue channel, but it should come after the core direct data-selling flow is working.

## First Priority

The first priority is to connect the data supplier APIs and make real selling work.

Phase 1 should focus on:

- Connecting the APIs from the data suppliers
- Allowing customers to buy data
- Making payments work
- Making the wallet work for logged-in users
- Making order creation and fulfillment work
- Making the full customer purchase flow reliable

The platform should first be able to let a customer visit the site, buy data, pay successfully, and receive the purchased data.

Only after that should the project move into the agent and multi-agent storefront features.

## Current Project Understanding

The current codebase already has:

- A strong UI shell
- Dashboard, services, payments, wallet, and account pages
- Mock wallet state
- Mock transactions
- Mock payment links
- Mock funding methods
- Demo data bundle flow
- Demo service purchase flows
- Supabase client and migrations in the repo

However, the active frontend is mostly using local browser storage and mock data. The frontend is not yet truly connected to Supabase for the live app experience, and the data purchase flow is currently simulated.

## Planning Direction

The project should not start with the agent system.

The correct first product milestone is the customer-facing direct data purchase system, including wallet support for logged-in users.

Once that works, the same order, product, payment, wallet, fulfillment, and pricing engine can be extended into the pro-agent and basic-agent system.
