import assert from "node:assert/strict";
import test from "node:test";
import {
  acquisitionChannelInitializationSql,
  initializeAcquisitionChannelsSql,
} from "../src/lib/server/acquisition-channel-defaults.ts";
import {
  readPipelineColumnsSql,
  createPipelineColumnSql,
  updatePipelineColumnSql,
} from "../src/lib/server/pipeline-column-store.ts";

// Optional integration suite. It only writes temporary tables and always rolls back.
test(
  "PostgreSQL conserva etapas e canais após renomear, reordenar, inativar e reler",
  { skip: !process.env.STAR_TEST_DATABASE_URL },
  async () => {
    const module = await import(process.env.STAR_TEST_PG_MODULE ?? "pg");
    const pg = module.default ?? module.i;
    const pool = new pg.Pool({ connectionString: process.env.STAR_TEST_DATABASE_URL, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local search_path = pg_temp");
      await client.query(`
      create temporary table app_units (id uuid primary key);
      create temporary table app_acquisition_channels (
        id uuid primary key default gen_random_uuid(), unit_id uuid not null,
        name text not null, type text not null, status text not null,
        unique(unit_id,name)
      );
      create temporary table app_pipeline_columns (
        id uuid primary key default gen_random_uuid(), unit_id uuid not null,
        pipeline_type text not null, name text not null, color text not null,
        position integer not null, system_key text, semantic_stage text,
        created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now()
      );
    `);
      await client.query(acquisitionChannelInitializationSql);
      const unit = "11111111-1111-4111-8111-111111111111";
      const otherUnit = "22222222-2222-4222-8222-222222222222";
      await client.query("insert into app_units values ($1),($2)", [unit, otherUnit]);
      const seed = JSON.stringify([
        { name: "Meta Ads", type: "Pago" },
        { name: "WhatsApp", type: "Conversacional" },
      ]);
      await client.query(initializeAcquisitionChannelsSql, [unit, seed]);
      await client.query(
        "update app_acquisition_channels set name='Campanhas Meta',status='inactive' where unit_id=$1 and name='Meta Ads'",
        [unit],
      );
      for (let n = 0; n < 3; n++)
        await client.query(initializeAcquisitionChannelsSql, [unit, seed]);
      assert.deepEqual(
        (
          await client.query(
            "select name,status from app_acquisition_channels where unit_id=$1 order by name",
            [unit],
          )
        ).rows,
        [
          { name: "Campanhas Meta", status: "inactive" },
          { name: "WhatsApp", status: "active" },
        ],
      );
      await client.query("delete from app_acquisition_channels where unit_id=$1", [unit]);
      await client.query(initializeAcquisitionChannelsSql, [unit, seed]);
      assert.equal(
        (await client.query("select * from app_acquisition_channels where unit_id=$1", [unit]))
          .rowCount,
        0,
      );
      // Existing units are never supplemented with defaults, including renamed/default-deleted units.
      await client.query(
        "insert into app_acquisition_channels (unit_id,name,type,status) values ($1,'Fonte própria','Próprio','active')",
        [otherUnit],
      );
      await client.query(initializeAcquisitionChannelsSql, [otherUnit, seed]);
      assert.deepEqual(
        (
          await client.query("select name from app_acquisition_channels where unit_id=$1", [
            otherUnit,
          ])
        ).rows,
        [{ name: "Fonte própria" }],
      );
      const first = (
        await client.query(createPipelineColumnSql, [
          unit,
          "leads",
          "Atendimento",
          "blue",
          20,
          "Em contato",
          null,
        ])
      ).rows[0];
      const custom = (
        await client.query(createPipelineColumnSql, [
          unit,
          "leads",
          "Retorno",
          "rose",
          30,
          "Em contato",
          null,
        ])
      ).rows[0];
      await client.query(updatePipelineColumnSql, [custom.id, unit, "Follow-up amanhã", "gold", 5]);
      assert.equal(
        (await client.query(updatePipelineColumnSql, [first.id, otherUnit, "Inválido", "rose", 1]))
          .rowCount,
        0,
      );
      const reloaded = (await client.query(readPipelineColumnsSql, [unit])).rows;
      assert.deepEqual(
        reloaded.map(
          (row: { name: string; color: string; position: number; semantic_stage: string }) => [
            row.name,
            row.color,
            row.position,
            row.semantic_stage,
          ],
        ),
        [
          ["Follow-up amanhã", "gold", 5, "Em contato"],
          ["Atendimento", "blue", 20, "Em contato"],
        ],
      );
      assert.equal(reloaded[0].id, custom.id);
    } finally {
      await client.query("rollback");
      client.release();
      await pool.end();
    }
  },
);
