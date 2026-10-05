// TEST ONLY. Minimal M1/M2/M4/M5 contracts to exercise the real M3 SQL.
// Never import this module from createApp or a production service.
import { readFile } from 'node:fs/promises';
import { ApiError } from '../src/errors.js';
import { up as installCheckout } from '../db/007-checkout-fulfilment.mjs';

export async function installFixture(connection) {
  const foundation = await readFile(new URL('../db/001-foundation.sql', import.meta.url), 'utf8');
  for (const statement of foundation.split(';').map((s) => s.trim()).filter(Boolean)) {
    await connection.query(statement);
  }
  const prerequisites = [
    "ALTER TABLE products ADD currency CHAR(3) NOT NULL DEFAULT 'USD', ADD is_active BOOLEAN NOT NULL DEFAULT 1, ADD is_legacy BOOLEAN NOT NULL DEFAULT 0",
    'ALTER TABLE variants ADD is_active BOOLEAN NOT NULL DEFAULT 1',
    'CREATE TABLE categories (id INT UNSIGNED PRIMARY KEY, name VARCHAR(100) NOT NULL) ENGINE=InnoDB',
    'CREATE TABLE product_categories (product_id INT UNSIGNED, category_id INT UNSIGNED, PRIMARY KEY(product_id,category_id), FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(category_id) REFERENCES categories(id)) ENGINE=InnoDB',
    'CREATE TABLE cities (id INT UNSIGNED PRIMARY KEY,name VARCHAR(100),is_main_city BOOLEAN,is_active BOOLEAN) ENGINE=InnoDB',
    'CREATE TABLE stores (id INT UNSIGNED PRIMARY KEY,name VARCHAR(100),city_id INT UNSIGNED,address_line VARCHAR(250),is_active BOOLEAN, FOREIGN KEY(city_id) REFERENCES cities(id)) ENGINE=InnoDB',
    'ALTER TABLE addresses ADD city_id INT UNSIGNED NULL, ADD FOREIGN KEY(city_id) REFERENCES cities(id)',
    'CREATE TABLE carts (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,customer_id INT UNSIGNED UNIQUE NOT NULL,version INT UNSIGNED NOT NULL DEFAULT 0,FOREIGN KEY(customer_id) REFERENCES customers(id)) ENGINE=InnoDB',
    'CREATE TABLE cart_items (cart_id INT UNSIGNED,variant_id INT UNSIGNED,quantity INT UNSIGNED NOT NULL,PRIMARY KEY(cart_id,variant_id),FOREIGN KEY(cart_id) REFERENCES carts(id),FOREIGN KEY(variant_id) REFERENCES variants(id),CHECK(quantity BETWEEN 1 AND 99)) ENGINE=InnoDB',
    `CREATE TABLE inventory_movements (id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      variant_id INT UNSIGNED NOT NULL,order_id INT UNSIGNED NULL,admin_id INT UNSIGNED NULL,
      change_qty INT NOT NULL,stock_after BIGINT NOT NULL,movement_type VARCHAR(30) NOT NULL,
      reason VARCHAR(200) NOT NULL,reference_key VARCHAR(100) UNIQUE NOT NULL,
      FOREIGN KEY(variant_id) REFERENCES variants(id),FOREIGN KEY(order_id) REFERENCES orders(id)) ENGINE=InnoDB`,
    `CREATE TRIGGER m3_fixture_stock_apply BEFORE INSERT ON inventory_movements FOR EACH ROW
     BEGIN
       DECLARE balance BIGINT;
       SELECT CAST(stock AS SIGNED) INTO balance FROM variants WHERE id=NEW.variant_id FOR UPDATE;
       IF balance IS NULL OR NEW.change_qty=0 OR balance+NEW.change_qty<0 OR balance+NEW.change_qty>4294967295 THEN
         SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid fixture stock change';
       END IF;
       SET NEW.stock_after=balance+NEW.change_qty;
       UPDATE variants SET stock=NEW.stock_after WHERE id=NEW.variant_id;
     END`,
    `CREATE PROCEDURE m3_fixture_stock_change(IN v INT UNSIGNED,IN delta INT,IN kind VARCHAR(30),
      IN oid INT UNSIGNED,IN aid INT UNSIGNED,IN ref VARCHAR(100),IN why VARCHAR(200))
     BEGIN
       DECLARE balance BIGINT;
       SELECT CAST(stock AS SIGNED) INTO balance FROM variants WHERE id=v FOR UPDATE;
       IF EXISTS(SELECT 1 FROM inventory_movements WHERE reference_key=ref) THEN
         IF NOT EXISTS(SELECT 1 FROM inventory_movements WHERE reference_key=ref AND variant_id=v
           AND change_qty=delta AND movement_type=kind AND (order_id <=> oid)
           AND (admin_id <=> aid) AND reason=why) THEN
           SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fixture movement conflict';
         END IF;
       ELSE
         INSERT INTO inventory_movements(variant_id,order_id,admin_id,change_qty,stock_after,movement_type,reason,reference_key)
         VALUES(v,oid,aid,delta,balance+delta,kind,why,ref);
       END IF;
     END`,
    `CREATE FUNCTION fn_delivery_days(main_city BOOLEAN,shortage BOOLEAN) RETURNS INT DETERMINISTIC NO SQL
     RETURN IF(main_city,5,7)+IF(shortage,3,0)`,
  ];
  for (const sql of prerequisites) await connection.query(sql);
  await installCheckout(connection);
  await installCheckout(connection); // successful repeat must verify rather than recreate
  await connection.query("INSERT INTO customers(id,name,email,password_hash,role) VALUES (1,'A','a@example.test','test-only-unused','customer'),(2,'B','b@example.test','test-only-unused','customer'),(3,'Admin','admin@example.test','test-only-unused','admin')");
  await connection.query("INSERT INTO cities VALUES(1,'Main',1,1),(2,'Other',0,1)");
  await connection.query("INSERT INTO stores VALUES(1,'Pickup',1,'Store road',1),(2,'Other Pickup',2,'Other road',1)");
  await connection.query("INSERT INTO addresses(id,customer_id,recipient,line1,city,postal_code,country,city_id) VALUES(1,1,'A','Address A','Main','75001','US',1),(2,2,'B','Address B','Other','75002','US',2),(3,1,'A','Address C','Other','75002','US',2)");
  await connection.query("INSERT INTO products(id,name,description) VALUES(1,'Speaker','Demo'),(2,'Toy','Demo')");
  await connection.query("INSERT INTO variants(id,product_id,sku,name,price,stock) VALUES(1,1,'A','Blue','40.00',0),(2,2,'B','Small','15.00',0)");
  await connection.query("INSERT INTO categories VALUES(1,'Audio'),(2,'Toys')");
  await connection.query('INSERT INTO product_categories VALUES(1,1),(2,2)');
  await connection.query('INSERT INTO carts(id,customer_id) VALUES(1,1),(2,2)');
}
export async function readCart(connection, id) {
  const [[cart]] = await connection.execute('SELECT id,version FROM carts WHERE customer_id=?', [id]);
  if (!cart) return { version: 0, items: [] };
  const [items] = await connection.execute('SELECT variant_id AS variantId,quantity FROM cart_items WHERE cart_id=? ORDER BY variant_id',[cart.id]);
  return { version: cart.version, items };
}
export async function getDestination(connection, mode, id, owner) {
  const delivery = mode === 'delivery';
  const [rows] = await connection.execute(delivery
    ? 'SELECT id,recipient,line1,postal_code AS postalCode,country,city_id AS cityId FROM addresses WHERE id=? AND customer_id=? FOR UPDATE'
    : 'SELECT id,name AS storeName,address_line AS addressLine,city_id AS cityId,is_active AS isActive FROM stores WHERE id=? FOR UPDATE',
    delivery ? [id,owner] : [id]);
  if (!rows[0]) throw new ApiError(404,'NOT_FOUND','Destination not found.');
  const row=rows[0];
  const [[city]]=await connection.execute('SELECT name,is_main_city AS isMain,is_active AS isActive FROM cities WHERE id=? FOR SHARE',[row.cityId]);
  if (!city?.isActive || (!delivery && !row.isActive) || (delivery && row.country!=='US')) {
    throw new ApiError(409,'DESTINATION_UNSUPPORTED','Destination unavailable.');
  }
  const snapshot={cityId:row.cityId,city:city.name,country:'US',isMainCity:Boolean(city.isMain),
    ...(delivery ? {recipient:row.recipient,line1:row.line1,postalCode:row.postalCode}
      : {storeId:id,storeName:row.storeName,addressLine:row.addressLine})};
  return {addressId:delivery?id:null,storeId:delivery?null:id,isMainCity:Boolean(city.isMain),snapshot};
}
export async function deliveryDays(connection,main,shortage) {
  const [[row]]=await connection.execute('SELECT fn_delivery_days(?,?) AS days',[Number(main),Number(shortage)]);
  return row.days;
}
export async function applyStockChange(connection,c) {
  await connection.execute('CALL m3_fixture_stock_change(?,?,?,?,?,?,?)',
    [c.variantId,c.quantityDelta,c.movementType,c.orderId,c.adminId,c.referenceKey,c.reason]);
}
