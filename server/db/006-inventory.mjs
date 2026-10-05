export async function up(connection) {

    //create table
    await connection.query(
        `create table if not exists inventory_movements (
            id             int unsigned not null auto_increment,
            variant_id     int unsigned not null,
            order_id       int unsigned null,
            admin_id       int unsigned null,
            change_qty     int not null,
            stock_after    int unsigned not null,
            movement_type  enum('sale', 'adjustment', 'allocation', 'cancellation') not null,
            reason         varchar(200) not null,
            reference_key  varchar(100) not null,
            created_at     timestamp default current_timestamp not null,
            primary key (id),
            unique key uq_inventory_movements_reference_key (reference_key),
            key idx_inventory_movements_variant_time (variant_id, created_at, id),
            foreign key (variant_id) references variants(id),
            foreign key (order_id) references orders(id),
            foreign key (admin_id) references customers(id)
            );`
    )
    //store procedure to apply stock change
    await connection.query(`
    drop procedure if exists sp_apply_stock_change;`)

    await connection.query(`
    create procedure sp_apply_stock_change(
        in variant_id int unsigned,
        in delta int,
        in movement_type enum('sale','adjustment','allocation','cancellation'),
        in order_id int unsigned,
        in admin_id int unsigned,
        in ref_key varchar(100),
        in reason varchar(200)
    )

    sp_body: begin

        declare temp_current_stock int unsigned;
        declare temp_stock_after int;
        declare temp_move_id int unsigned;
        declare temp_existing_id int unsigned;
        declare continue handler for not found set temp_existing_id = null;

        select stock into temp_current_stock
        from variants
        where id = variant_id
        for update;

        select id into temp_existing_id
        from inventory_movements
        where reference_key = ref_key
        limit 1;
        

        if temp_existing_id is not null then

            select *
            from inventory_movements
            where id = temp_existing_id;

            leave sp_body;

        end if;

        if delta = 0 then

            signal sqlstate '45000'
            set message_text =
                'INVALID_DELTA: change_qty must not be zero';

        end if;

        set temp_stock_after = temp_current_stock + delta;

        if temp_stock_after < 0 then

            signal sqlstate '45000'
            set message_text =
                'INSUFFICIENT_STOCK: stock would go negative';

        end if;

        insert into inventory_movements
            (
                variant_id,
                order_id,
                admin_id,
                change_qty,
                stock_after,
                movement_type,
                reason,
                reference_key
            )
        values
            (
                variant_id,
                order_id,
                admin_id,
                delta,
                temp_stock_after,
                movement_type,
                reason,
                ref_key
            );

        set temp_move_id = last_insert_id();

        select *
        from inventory_movements
        where id = temp_move_id;

    end
        `);

    await connection.query(`
    drop trigger if exists trg_stock_movement_apply;`)

    await connection.query(`
    create trigger trg_stock_movement_apply

    after insert on inventory_movements

    for each row

    trg_body: begin

        declare v_new_stock int;

        
        if new.movement_type not in ('sale','adjustment','allocation','cancellation') then

            signal sqlstate '45000'
            set message_text =
                'invalid_movement_type: unknown type in trigger';

        end if;

        
        if new.stock_after > 2147483647 then

            signal sqlstate '45000'
            set message_text =
                'stock_overflow: stock_after exceeds int range';

        end if;

        
        update variants

        set stock = stock + new.change_qty

        where id = new.variant_id;

        
        select stock into v_new_stock

        from variants

        where id = new.variant_id;

        
        if v_new_stock != new.stock_after then

            signal sqlstate '45000'
            set message_text =
                'stock_mismatch: actual stock does not match expected stock_after';

        end if;

    end
    `);


}


